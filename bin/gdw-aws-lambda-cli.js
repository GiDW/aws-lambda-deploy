#!/usr/bin/env node

'use strict';

const readline = require('readline');

const GdwAwsLambda = require('../lib/gdw-aws-lambda');

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

            switch (remainingArguments.length) {
                case 0:

                    GdwAwsLambda.test()
                        .then(onTestResult, onTestError);

                    break;
                case 1:

                    GdwAwsLambda.test(remainingArguments[0])
                        .then(onTestResult, onTestError);

                    break;
                default:

                    printTestUsage();
            }

            break;
        case CMD_DEPLOY:

            GdwAwsLambda.deploy()
                .then(onDeployResult, onDeployError);

            break;
        default:

            printUsage();
    }
}

function onDeployError (error) {

    switch (error) {
        case GdwAwsLambda.ERR_LAMBDA_NOT_FOUND:

            askConfirmation(
                'Create AWS Lambda function (' +
                GdwAwsLambda.lambdaCfg.FunctionName + ')?',
                true,
                onConfirmation
            );

            break;
        case GdwAwsLambda.ERR_LAMBDA_CONFIG:

            askConfirmation(
                'Update AWS Lambda function  (' +
                GdwAwsLambda.lambdaCfg.FunctionName + ') configuration?',
                true,
                onConfirmation
            );

            break;
        default:
            console.error('Deploy ERROR', error);
    }

    function onConfirmation (answer) {

        if (answer) {

            switch (error) {
                case GdwAwsLambda.ERR_LAMBDA_NOT_FOUND:

                    GdwAwsLambda.deploy({ create: true })
                        .then(onDeployResult, onErrorDeploy);

                    break;
                case GdwAwsLambda.ERR_LAMBDA_CONFIG:

                    GdwAwsLambda.deploy({ updateConfig: true })
                        .then(onDeployResult, onErrorDeploy);
            }

        }
    }

}

function onDeployResult (result) {
    console.info('Deploy result', result);
}

function onErrorDeploy (error) {
    console.info('Deploy error', error);
}

function onTestResult (result) {
    console.info('Test result', result);
}

function onTestError (error) {
    console.info('Test error', error);
}

/**
 * Ask a yes/no question
 *
 * @param {string} question
 * @param {boolean} defaultAnswer
 * @param {onResponse} callback
 */
function askConfirmation (question, defaultAnswer, callback) {

    let options, completeQuestion;

    options = '';

    if (defaultAnswer === true) options += ' [Y/n] ';
    if (defaultAnswer === false) options += ' [y/N] ';

    completeQuestion = question + options;

    const rl = readline.createInterface({
        'input': process.stdin,
        'output': process.stdout
    });

    rl.question(completeQuestion, onResponse);

    /**
     * @param {string} answer
     */
    function onResponse (answer) {

        let cbAnswer;

        if (answer.length === 0) {

            cbAnswer = defaultAnswer;

        } else if (answer.charAt(0) === 'y' || answer.charAt(0) === 'Y') {

            cbAnswer = true;

        } else if (answer.charAt(0) === 'n' || answer.charAt(0) === 'N') {

            cbAnswer = false;

        }

        if (cbAnswer === true || cbAnswer === false) {

            rl.close();
            callback(cbAnswer);

        } else {

            rl.question(completeQuestion, onResponse);

        }
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
