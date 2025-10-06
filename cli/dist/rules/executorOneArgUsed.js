"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@typescript-eslint/utils");
const visitor_keys_1 = require("@typescript-eslint/visitor-keys");
const executorOneArgUsedRule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Detect Promise constructors that use only one of resolve/reject',
            recommended: false
        },
        messages: {
            oneArgExecutor: 'Promise executor uses only one of its callbacks (resolve/reject), indicating incomplete handling.'
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        const isNode = (value) => typeof value === 'object' &&
            value !== null &&
            'type' in value &&
            typeof value.type === 'string';
        const traversalKeys = context.getSourceCode().visitorKeys ?? visitor_keys_1.visitorKeys;
        function isIdentifierUsed(name, func) {
            let used = false;
            const seen = new Set();
            const stack = [
                { node: func.body, parent: func }
            ];
            while (stack.length && !used) {
                const { node, parent } = stack.pop();
                if (seen.has(node)) {
                    continue;
                }
                seen.add(node);
                if ((node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) &&
                    node !== func) {
                    const shadowed = node.params.some((param) => param.type === utils_1.AST_NODE_TYPES.Identifier && param.name === name);
                    if (shadowed) {
                        continue;
                    }
                }
                if (node.type === utils_1.AST_NODE_TYPES.Identifier && node.name === name) {
                    if (parent &&
                        parent.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        parent.property === node &&
                        !parent.computed) {
                        // property named like the identifier (not a variable usage)
                    }
                    else {
                        used = true;
                        break;
                    }
                }
                const keys = traversalKeys[node.type] ?? [];
                for (const key of keys) {
                    const value = node[key];
                    if (!value) {
                        continue;
                    }
                    if (Array.isArray(value)) {
                        for (const child of value) {
                            if (isNode(child)) {
                                stack.push({ node: child, parent: node });
                            }
                        }
                    }
                    else if (isNode(value)) {
                        stack.push({ node: value, parent: node });
                    }
                }
            }
            return used;
        }
        return {
            NewExpression(node) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'Promise' &&
                    node.arguments.length === 1) {
                    const executor = node.arguments[0];
                    if (executor &&
                        (executor.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                            executor.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                        const params = executor.params;
                        const resolveParam = params[0] && params[0].type === utils_1.AST_NODE_TYPES.Identifier ? params[0].name : null;
                        const rejectParam = params[1] && params[1].type === utils_1.AST_NODE_TYPES.Identifier ? params[1].name : null;
                        let usesResolve = false;
                        let usesReject = false;
                        if (resolveParam) {
                            usesResolve = isIdentifierUsed(resolveParam, executor);
                        }
                        if (rejectParam) {
                            usesReject = isIdentifierUsed(rejectParam, executor);
                        }
                        const paramCount = params.length;
                        if (paramCount < 2 || !(usesResolve && usesReject)) {
                            context.report({
                                node: executor,
                                messageId: 'oneArgExecutor'
                            });
                        }
                    }
                }
            }
        };
    }
};
exports.default = executorOneArgUsedRule;
