/*
  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/* global esmorph:true,esprima:true */

(function (exports) {
    'use strict';

    if (module && module.exports) {
        var esprima = require('esprima');
    }

    var Syntax = {
        AssignmentExpression: 'AssignmentExpression',
        ArrayExpression: 'ArrayExpression',
        BlockStatement: 'BlockStatement',
        BinaryExpression: 'BinaryExpression',
        BreakStatement: 'BreakStatement',
        CallExpression: 'CallExpression',
        CatchClause: 'CatchClause',
        ConditionalExpression: 'ConditionalExpression',
        ContinueStatement: 'ContinueStatement',
        DoWhileStatement: 'DoWhileStatement',
        DebuggerStatement: 'DebuggerStatement',
        EmptyStatement: 'EmptyStatement',
        ExpressionStatement: 'ExpressionStatement',
        ForStatement: 'ForStatement',
        ForInStatement: 'ForInStatement',
        FunctionDeclaration: 'FunctionDeclaration',
        FunctionExpression: 'FunctionExpression',
        Identifier: 'Identifier',
        IfStatement: 'IfStatement',
        Literal: 'Literal',
        LabeledStatement: 'LabeledStatement',
        LogicalExpression: 'LogicalExpression',
        MemberExpression: 'MemberExpression',
        NewExpression: 'NewExpression',
        ObjectExpression: 'ObjectExpression',
        Program: 'Program',
        Property: 'Property',
        ReturnStatement: 'ReturnStatement',
        SequenceExpression: 'SequenceExpression',
        SwitchStatement: 'SwitchStatement',
        SwitchCase: 'SwitchCase',
        ThisExpression: 'ThisExpression',
        ThrowStatement: 'ThrowStatement',
        TryStatement: 'TryStatement',
        UnaryExpression: 'UnaryExpression',
        UpdateExpression: 'UpdateExpression',
        VariableDeclaration: 'VariableDeclaration',
        VariableDeclarator: 'VariableDeclarator',
        WhileStatement: 'WhileStatement',
        WithStatement: 'WithStatement'
    };

    // Executes visitor on the object and its children (recursively).

    function traverse(object, visitor, master) {
        var key, child, parent, path;

        parent = (typeof master === 'undefined') ? [] : master;

        if (visitor.call(null, object, parent) === false) {
            return;
        }
        for (key in object) {
            if (object.hasOwnProperty(key)) {
                child = object[key];
                path = [ object ];
                path.push(parent);
                if (typeof child === 'object' && child !== null) {
                    traverse(child, visitor, path);
                }
            }
        }
    }


    // Insert trace function call(s) in function bodies
    // It will be in the form of a function call:
    //
    //     traceName(object);
    //
    // where the object contains the following properties:
    //
    //    'name' holds the name of the function
    //    'lineNumber' holds the starting line number of the function block
    //    'range' contains the index-based range of the function
    //
    // The name of the function represents the associated reference for
    // the function (deduced on a best-effort basis if it is not
    // a function declaration).
    //
    // If traceName is a function instead of a string, it will be invoked and
    // the result will be used as the entire prolog. The arguments for the
    // invocation are the function name, range, and location info.

    function traceFunctionBody(traceName, options) {
        options = options || {};

        function calculatePositions(node) {
            debugger;

            var pos = [],
                lastChild,
                posEntrance,
                posExit;

            // calculate entrance position
            posEntrance = node.body.range[0];

            // calculate exit position
            lastChild = node.body.body[node.body.body.length - 1];

            if(!lastChild) {
                posExit = node.body.range[0];
            } else if (lastChild.type === Syntax.ReturnStatement) {
                posExit = lastChild.range[0] - 1;
            } else {
                posExit = lastChild.range[1] - 1;
            }

            if (options.entrance) {
                pos.push(posEntrance);
            }

            if (options.exit) {
                pos.push(posExit);
            }

            if (!options.exit && !options.entrance) {
                pos.push(posEntrance, posExit);
            }

            return pos;
        }

        return function (code) {
            var tree,
                functionList,
                param,
                signature,
                pos,
                i,
                j,
                flItem;

            tree = esprima.parse(code, { range: true, loc: true });

            functionList = [];
            traverse(tree, function (node, path) {
                var parent,
                    functionName;

                if (node.type === Syntax.FunctionDeclaration) {
                    functionName = node.id.name;
                } else if (node.type === Syntax.FunctionExpression) {
                    parent = path[0];

                    switch (parent.type) {
                    case Syntax.AssignmentExpression:
                        functionName = code.slice(parent.left.range[0], parent.left.range[1] + 1);
                        break;
                    case Syntax.Property:
                        functionName = parent.key && parent.key.name;
                        break;
                    case Syntax.VariableDeclarator:
                    case Syntax.CallExpression:
                        functionName = parent.id && parent.id.name;
                        break;
                    default:
                        if (typeof parent.length === 'number') {
                            functionName = parent.id && parent.id.name;
                        } else if (parent.key && parent.key.type === 'Identifier') {
                            if (parent.value === node && parent.key.name) {
                                functionName = parent.key.name;
                            }
                        }
                    }
                    // functionName = functionName || '[Anonymous]';
                }

                if (functionName) {
                    functionList.push({
                        name: functionName,
                        range: node.range,
                        loc: node.loc,
                        blockStarts: calculatePositions(node)
                    });
                }
            });

            // Insert the instrumentation code from the last entry.
            // This is to ensure that the range for each entry remains valid
            // (it won't shift due to some new inserting string before the range).
            for (i = functionList.length - 1; i >= 0; i -= 1) {
                flItem = functionList[i];
                param = {
                    name: flItem.name,
                    range: flItem.range,
                    loc: flItem.loc
                };
                if (typeof traceName === 'function') {
                    signature = traceName.call(null, param);
                } else {
                    signature = traceName + '({ ';
                    signature += 'name: \'' + flItem.name + '\', ';
                    if (typeof flItem.loc !== 'undefined') {
                        signature += 'lineNumber: ' + flItem.loc.start.line + ', ';
                    }
                    signature += 'range: [' + flItem.range[0] + ', ' +
                        flItem.range[1] + '] ';
                    signature += '});';
                }

                if (typeof flItem.blockStarts === "number") {
                    flItem.blockStarts = [flItem.blockStarts];
                }

                for (j = flItem.blockStarts.length - 1; j >= 0; j -= 1) {
                    pos = flItem.blockStarts[j] + 1;
                    code = code.slice(0, pos) + signature + code.slice(pos, code.length);
                }
            }

            return code;
        };
    }

    // Insert trace at beginning of function bodies

    function traceFunctionEntrance(traceName) {
        return traceFunctionBody(traceName, { entrance: true } );
    }

    // Same as traceFunctionEntrance, but inserts trace at end of function bodies

    function traceFunctionExit(traceName) {
        return traceFunctionBody(traceName, { exit: true } );
    }

    // Combination of traceFunctionEntrance and traceFunctionExit

    function traceFunctionEntranceAndExit(traceName) {
        return traceFunctionBody(traceName, { entrance: true, exit: true } );
    }

    function modify(code, modifiers) {
        var i;

        if (Object.prototype.toString.call(modifiers) === '[object Array]') {
            for (i = 0; i < modifiers.length; i += 1) {
                code = modifiers[i].call(null, code);
            }
        } else if (typeof modifiers === 'function') {
            code = modifiers.call(null, code);
        } else {
            throw new Error('Wrong use of esmorph.modify() function');
        }

        return code;
    }

    // Sync with package.json.
    exports.version = '0.0.0-dev';

    exports.modify = modify;

    exports.Tracer = {
        FunctionEntrance: traceFunctionEntrance,
        FunctionExit: traceFunctionExit,
        FunctionEntranceAndExit: traceFunctionEntranceAndExit
    };

}(typeof exports === 'undefined' ? (esmorph = {}) : exports));
