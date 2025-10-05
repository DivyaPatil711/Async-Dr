"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@typescript-eslint/utils");
const asyncAwaitedReturnRule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow returning an awaited value in async functions',
            recommended: false
        },
        fixable: 'code',
        messages: {
            noReturnAwait: "Remove unnecessary 'await' in return; it adds extra microtask delay."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        return {
            ReturnStatement(node) {
                const argument = node.argument;
                if (!argument || argument.type !== utils_1.AST_NODE_TYPES.AwaitExpression) {
                    return;
                }
                const ancestors = context.getAncestors();
                const func = [...ancestors].reverse().find((ancestor) => {
                    switch (ancestor.type) {
                        case utils_1.AST_NODE_TYPES.FunctionDeclaration:
                        case utils_1.AST_NODE_TYPES.FunctionExpression:
                        case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
                            return true;
                        default:
                            return false;
                    }
                });
                if (!func || !func.async) {
                    return;
                }
                context.report({
                    node: argument,
                    messageId: 'noReturnAwait',
                    fix(fixer) {
                        if (ancestors.some(ancestor => ancestor.type === utils_1.AST_NODE_TYPES.TryStatement)) {
                            return null;
                        }
                        const sourceCode = context.getSourceCode();
                        const awaitToken = sourceCode.getFirstToken(argument);
                        if (!awaitToken) {
                            return null;
                        }
                        return fixer.remove(awaitToken);
                    }
                });
            }
        };
    }
};
exports.default = asyncAwaitedReturnRule;
