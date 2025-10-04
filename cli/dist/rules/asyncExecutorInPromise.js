"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// async-executor-in-promise.ts
const utils_1 = require("@typescript-eslint/utils");
const asyncExecutorInPromiseRule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow async functions as Promise executors.',
            recommended: false
        },
        fixable: 'code',
        messages: {
            noAsyncExecutor: 'Avoid using an async Promise executor; it can cause unhandled rejections. Use a synchronous executor and call resolve/reject.'
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        return {
            NewExpression(node) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'Promise' &&
                    node.arguments.length === 1) {
                    const executor = node.arguments[0];
                    if (executor &&
                        (executor.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                            executor.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) &&
                        executor.async) {
                        context.report({
                            node: executor,
                            messageId: 'noAsyncExecutor',
                            fix: fixer => {
                                // Safe, minimal fix: drop the `async` keyword on the executor
                                // (keeps semantics closest while avoiding hidden async errors)
                                const src = context.getSourceCode();
                                const firstToken = src.getFirstToken(executor);
                                if (firstToken && firstToken.value === 'async') {
                                    return fixer.remove(firstToken);
                                }
                                return null;
                            }
                        });
                    }
                }
            }
        };
    }
};
exports.default = asyncExecutorInPromiseRule;
