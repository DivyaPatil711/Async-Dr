"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@typescript-eslint/utils");
const customPromisificationRule = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Detect manual Promise construction (custom promisification)',
            recommended: false
        },
        messages: {
            avoidNewPromise: 'Avoid manual Promise construction; use async/await or built-in Promise APIs instead.'
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
                            executor.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                        context.report({
                            node,
                            messageId: 'avoidNewPromise'
                        });
                    }
                }
            }
        };
    }
};
exports.default = customPromisificationRule;
