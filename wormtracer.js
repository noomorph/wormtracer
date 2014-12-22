#!/usr/local/bin/node

var fs = require('fs'),
    esmorph = require('esmorph');

function main(argv) {
    var fin = argv[2],
        rewrite = argv[3],
        source,
        instrumented;

    if (!fin || !fs.existsSync(fin)) {
        console.log('please specify valid file as argument');
        console.log('add --instrument option to rewrite the file');
        return;
    }

    source = fs.readFileSync(fin, 'utf-8');
    instrumented = instrument(source, fin);

    if (rewrite === '--instrument') {
        fs.writeFileSync(fin, instrumented);
        console.log(fin, 'has been successfully instrumented');
    } else {
        console.log(instrumented);
    }
}

function instrument(code, filename) {
    var onEnter, onExit, signature;

    function J$(fn) {
        return JSON.stringify({
            fn: fn.name,
            file: filename,
            line: fn.loc.start.line
        });
    }

    if (code.indexOf('TRACE.onEnter(') >= 0) {
        return code;
    }

    onEnter = esmorph.Tracer.FunctionEntrance(function (fn) {
        return '\nTRACE.onEnter(' + J$(fn) + ');';
    });

    onExit = esmorph.Tracer.FunctionExit(function (fn) {
        return '\nTRACE.onExit(' + J$(fn) + ');';
    });

    code = esmorph.modify(code, onEnter);
    code = esmorph.modify(code, onExit);
    return code;
}

main(process.argv);
