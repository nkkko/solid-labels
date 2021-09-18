import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import getHookIdentifier from './get-hook-identifier';
import { ImportHook } from './types';

export default function signalVariableExpression(
  hooks: ImportHook,
  path: NodePath<t.VariableDeclarator>,
  signalIdentifier: t.Identifier,
  stateIdentifier: t.Expression,
): void {
  const readIdentifier = path.scope.generateUidIdentifier(signalIdentifier.name);
  const writeIdentifier = path.scope.generateUidIdentifier(`set${signalIdentifier.name}`);

  path.node.id = t.arrayPattern([
    readIdentifier,
    writeIdentifier,
  ]);
  path.node.init = t.callExpression(
    getHookIdentifier(hooks, path, 'createSignal'),
    [
      stateIdentifier,
      t.objectExpression([
        t.objectProperty(
          t.identifier('name'),
          t.stringLiteral(signalIdentifier.name),
        ),
      ]),
    ],
  );

  const parent = path.scope.path;
  if (parent) {
    parent.traverse({
      ObjectProperty(p) {
        if (p.scope !== path.scope && p.scope.hasOwnBinding(signalIdentifier.name)) {
          return;
        }
        if (
          p.node.shorthand
          && t.isIdentifier(p.node.key)
          && p.node.key.name === signalIdentifier.name
          && t.isIdentifier(p.node.value)
          && p.node.value.name === signalIdentifier.name
        ) {
          p.replaceWith(
            t.objectProperty(
              signalIdentifier,
              t.callExpression(
                readIdentifier,
                [],
              ),
            ),
          );
        }
      },
      Identifier(p) {
        if (p.node.name !== signalIdentifier.name) {
          return;
        }
        if (p.scope !== path.scope && p.scope.hasOwnBinding(signalIdentifier.name)) {
          return;
        }
        // { x }
        if (t.isObjectMethod(p.parent) && p.parent.key === p.node) {
          return;
        }
        if (t.isObjectProperty(p.parent) && p.parent.key === p.node) {
          return;
        }
        // const x
        if (t.isVariableDeclarator(p.parent)) {
          if (p.parent.id === p.node) {
            return;
          }
          // if (p.parent.init !== p.node) {
          //   return;
          // }
          // if (
          //   t.isVariableDeclaration(p.parentPath.parent)
          //   && p.parentPath.parentPath
          //   && t.isLabeledStatement(p.parentPath.parentPath.parent)
          //   && p.parentPath.parentPath.parent.label.name === 'refSignal'
          //   && t.isIdentifier(p.parent.init)
          //   && p.parent.init.name === signalIdentifier.name
          // ) {
          //   p.parentPath.parentPath.parentPath?.insertAfter(
          //     t.variableDeclaration(
          //       'const',
          //       [
          //         t.variableDeclarator(
          //           p.parent.id,
          //           t.arrayExpression([
          //             readIdentifier,
          //             writeIdentifier,
          //           ]),
          //         ),
          //       ],
          //     ),
          //   );
          //   p.parentPath.remove();
          // }
          // return;
        }
        // const [x]
        if (t.isArrayPattern(p.parent) && p.parent.elements.includes(p.node)) {
          return;
        }
        // (x) => {}
        if (t.isArrowFunctionExpression(p.parent) && p.parent.params.includes(p.node)) {
          return;
        }
        // function (x)
        if (t.isFunctionExpression(p.parent) && p.parent.params.includes(p.node)) {
          return;
        }
        if (t.isFunctionDeclaration(p.parent) && p.parent.params.includes(p.node)) {
          return;
        }
        // x:
        if (t.isLabeledStatement(p.parent) && p.parent.label === p.node) {
          return;
        }
        // obj.x
        if (t.isMemberExpression(p.parent) && p.parent.property === p.node) {
          return;
        }
        // function x() {}
        if (t.isFunctionDeclaration(p.parent) && p.parent.id === p.node) {
          return;
        }
        // (y = x) => {}
        // function z(y = x) {}
        if (
          t.isAssignmentPattern(p.parent)
          && p.parent.left === p.node
          && (
            (
              t.isArrowFunctionExpression(p.parentPath.parent)
              && p.parentPath.parent.params.includes(p.parent)
            )
            || (
              t.isFunctionDeclaration(p.parentPath.parent)
              && p.parentPath.parent.params.includes(p.parent)
            )
            || (
              t.isFunctionExpression(p.parentPath.parent)
              && p.parentPath.parent.params.includes(p.parent)
            )
          )
        ) {
          return;
        }
        p.replaceWith(
          t.callExpression(
            readIdentifier,
            [],
          ),
        );
      },
      UpdateExpression(p) {
        if (p.scope !== path.scope && p.scope.hasOwnBinding(signalIdentifier.name)) {
          return;
        }
        if (t.isIdentifier(p.node.argument) && p.node.argument.name === signalIdentifier.name) {
          const param = p.scope.generateUidIdentifier('current');
          if (p.node.prefix) {
            p.replaceWith(
              t.callExpression(
                writeIdentifier,
                [
                  t.arrowFunctionExpression(
                    [param],
                    t.binaryExpression(
                      p.node.operator === '++' ? '+' : '-',
                      param,
                      t.numericLiteral(1),
                    ),
                  ),
                ],
              ),
            );
          } else {
            p.replaceWith(
              t.callExpression(
                t.arrowFunctionExpression(
                  [],
                  t.blockStatement([
                    t.variableDeclaration(
                      'const',
                      [
                        t.variableDeclarator(
                          param,
                          t.callExpression(
                            readIdentifier,
                            [],
                          ),
                        ),
                      ],
                    ),
                    t.expressionStatement(
                      t.callExpression(
                        writeIdentifier,
                        [
                          t.arrowFunctionExpression(
                            [],
                            t.binaryExpression(
                              p.node.operator === '++' ? '+' : '-',
                              param,
                              t.numericLiteral(1),
                            ),
                          ),
                        ],
                      ),
                    ),
                    t.returnStatement(
                      param,
                    ),
                  ]),
                ),
                [],
              ),
            );
          }
        }
      },
      AssignmentExpression(p) {
        if (p.scope !== path.scope && p.scope.hasOwnBinding(signalIdentifier.name)) {
          return;
        }
        const identifier = p.node.left;
        const expression = p.node.right;
        if (
          t.isIdentifier(identifier)
          && identifier.name === signalIdentifier.name
        ) {
          if (p.node.operator === '=') {
            p.replaceWith(
              t.callExpression(
                writeIdentifier,
                [
                  t.arrowFunctionExpression(
                    [],
                    expression,
                  ),
                ],
              ),
            );
          } else {
            const param = p.scope.generateUidIdentifier('current');
            p.replaceWith(
              t.callExpression(
                writeIdentifier,
                [
                  t.arrowFunctionExpression(
                    [param],
                    t.assignmentExpression(
                      p.node.operator,
                      param,
                      expression,
                    ),
                  ),
                ],
              ),
            );
          }
        }
      },
    });
  }
}
