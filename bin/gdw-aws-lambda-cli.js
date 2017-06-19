#!/usr/bin/env node

'use strict';

const readline = require('readline');

const GdwAwsLambda = require('../lib/gdw-aws-lambda');

console.log('GdwAwsLambda', GdwAwsLambda, typeof GdwAwsLambda, Object.keys(GdwAwsLambda));
// const lambda = new GdwAwsLambda();

const CMD_INIT = 'init';
const CMD_TEST = 'test';
const CMD_DEPLOY = 'deploy';

processCommand();

function processCommand () {

    let remainingArguments = [];
    let args = process.argv;
    let length = args.length;

    let verbose;
    let force;

    if (length > 3) {

        let i;
        for (i = 3; i < length; i++) {

            switch (args[i]) {
                case '-v':
                case '--verbose':

                    verbose = true;

                    break;
                case '-f':
                case '--force':

                    force = true;

                    break;
                default:

                    remainingArguments.push(args[i]);
            }
        }
    }

    switch (args[2]) {
        case CMD_INIT:

            GdwAwsLambda.init()
                .then(
                    (result) => {

                        console.log('Init result', result);

                    },
                    (error) => {

                        console.log('Init error', error);

                    });

            break;
        case CMD_TEST:

            console.log('TEST');

            printTestUsage();

            break;
        case CMD_DEPLOY:

            console.log('DEPLOY');

            break;
        default:

            printUsage();
    }
}

function printUsage () {
    console.info(
        '\n  Usage: node-lambda [command] [options]\n' +
        '\n  Commands:\n\n' +
        '    init\t\tCreate the config files\n' +
        '    test\t\tRun test\n' +
        '    deploy\t\tDeploy the Lambda to AWS\n' +
        '\n  Options:\n\n' +
        '    -v  \t\tVerbose' +
        '\n'
    );
}

function printTestUsage () {

    console.info(
        '\n  Usage: node-lambda test [tests_file] [options]\n' +
        '\n  tests_file:\t\tJSON file with following structure:\n' +
        '               \t\t{Array.<{name: string, context: ?Object,' +
        ' events: Array.<Object>}>}\n' +
        '               \t\tA test object can have a property {string} name.\n' +
        '               \t\tFor example:\n\n' +
        '               \t\t[\n' +
        '               \t\t  {\n' +
        '               \t\t    "name": "Context - Request ID"\n' +
        '               \t\t    "context": {\n' +
        '               \t\t      "awsRequestId": 12345\n' +
        '               \t\t    }.\n' +
        '               \t\t    "events": [\n' +
        '               \t\t      {\n' +
        '               \t\t        "val1": "abc"\n' +
        '               \t\t      },\n' +
        '               \t\t      {\n' +
        '               \t\t        "val1": 45\n' +
        '               \t\t      }\n' +
        '               \t\t    ]\n' +
        '               \t\t  },\n' +
        '               \t\t  {\n' +
        '               \t\t    "context": {\n' +
        '               \t\t      "clientContext": null\n' +
        '               \t\t    }.\n' +
        '               \t\t    "events": {\n' +
        '               \t\t      "val1": "def"\n' +
        '               \t\t    }\n' +
        '               \t\t  }\n' +
        '               \t\t]\n'
    );
}
