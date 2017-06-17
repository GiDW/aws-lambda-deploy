#!/usr/bin/env node

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const AWS = require('aws-sdk');

const CMD_INIT = 'init';
const CMD_TEST = 'test';
const CMD_DEPLOY = 'deploy';

const FILE_LAMBDA_CFG = 'lambda-config.json';
const FILE_LAMBDA_SECRETS = 'lambda-secrets.json';

const DEFAULT_FILE_TESTS = 'lambda-tests.json';

const AWS_LAMBDA_VERSION = '2015-03-31';

const AUTH_TYPE_PROFILE = 'profile';
const AUTH_TYPE_KEYS = 'keys';

const K_API_VERSION = 'apiVersion';
const K_CREDENTIALS = 'credentials';
const K_CONFIGURATION = 'Configuration';
const K_DRY_RUN = 'DryRun';
const K_CODE_SHA_256 = 'CodeSha256';
const K_CODE = 'Code';
const K_ZIP_FILE = 'ZipFile';

const K_ARCHIVE_NAME = 'archiveName';
const K_FUNCTION_NAME = 'FunctionName';
const K_DESCRIPTION = 'Description';
const K_TAGS = 'Tags';
const K_HANDLER = 'Handler';
const K_PUBLISH = 'Publish';
const K_RUNTIME = 'Runtime';
const K_MEMORY_SIZE = 'MemorySize';
const K_TIMEOUT = 'Timeout';

const K_REGION = 'region';
const K_PROFILE = 'profile';
const K_ACCESS_KEY_ID = 'accessKeyId';
const K_SECRET_ACCESS_KEY = 'secretAccessKey';
const K_ROLE = 'Role';
const K_ENVIRONMENT = 'Environment';

const K_VARIABLES = 'Variables';

const DEFAULT_CFG = {};
const DEFAULT_SECRETS = {};

// Helper variables

let verbose = false;
let force = false;
let codeSha256 = '';

// Set defaults
setDefaults(FILE_LAMBDA_CFG);
setDefaults(FILE_LAMBDA_SECRETS);

processCommand();

function processCommand () {

    let remainingArguments = [];
    let args = process.argv;
    let length = args.length;

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

            init();

            break;
        case CMD_TEST:

            length = remainingArguments.length;

            // Check for tests file argument
            if (length > 0) {

                // Check for single file
                if (length === 1) {

                    test(remainingArguments[0]);

                } else {

                    printTestUsage();
                }

            }

            break;
        case CMD_DEPLOY:

            deploy();

            break;
        default:

            printUsage();
    }
}

function init () {

    getJSON(
        FILE_LAMBDA_CFG,
        {
            printErrors: false,
            checkFileType: ''
        },
        onLambdaConfig
    );
    getJSON(
        FILE_LAMBDA_SECRETS,
        {
            printErrors: false,
            checkFileType: ''
        },
        onLambdaAwsConfig
    );

    function onLambdaConfig (obj) {

        if (!isObject(obj)) writeJSON(FILE_LAMBDA_CFG, DEFAULT_CFG);
    }

    function onLambdaAwsConfig (obj) {

        if (!isObject(obj)) writeJSON(FILE_LAMBDA_SECRETS, DEFAULT_SECRETS);
    }
}

/**
 * @param {string} testsFile
 */
function test (testsFile) {

    let lambdaCfg;
    let tests;

    getJSON(
        FILE_LAMBDA_CFG,
        {
            printErrors: true,
            checkFileType: FILE_LAMBDA_CFG
        },
        onLambdaConfig
    );

    if (isNEString(testsFile)) {

        getJSON(
            testsFile,
            {
                printErrors: true,
                checkFileType: DEFAULT_FILE_TESTS
            },
            onLambdaTests
        );

    }

    /**
     * @param {Array|string} obj
     */
    function onLambdaTests (obj) {

        console.log('Lamnda tests', obj);

        if (Array.isArray(obj)) {

            tests = obj;
            continueTest();

        }
    }

    function onLambdaConfig (obj) {

        if (isObject(obj)) {

            lambdaCfg = obj;
            continueTest();

        }
    }

    function continueTest () {

        if (tests && lambdaCfg) executeTests(tests, lambdaCfg);
    }
}

/**
 * Executa all tests
 *
 * @param {Array} tests
 * @param {Object} lambdaCfg
 */
function executeTests (tests, lambdaCfg) {

    let splits;
    let module;
    let eventHandler;
    let filePath;

    splits = lambdaCfg[K_HANDLER].split('.');

    if (splits.length === 2) {

        module = splits[0];
        eventHandler = splits[1];

        filePath = path.join(process.cwd(), module + '.js');

        const handler = require(filePath)[eventHandler];

        let i, length;

        length = tests.length;
        for (i = 0; i < length; i++) {

            executeContextTest(tests[i], handler, i);

        }

    } else {

        console.error('Invalid ' + K_HANDLER, lambdaCfg[K_HANDLER]);
    }

    /**
     * @param {Object} test
     * @param {function} handler
     * @param {number} id Test number
     */
    function executeContextTest (test, handler, id) {

        let i, length;

        length = test.events.length;
        for (i = 0; i < length; i++) {

            // Execute handler with test data
            handler(test.events[i], test.context, callback.bind(null, i));

        }

        function callback (i, err, data) {

            if (err) {

                console.log('Test (' + id + '-' + i + ') returned an error',
                    err);

            } else {

                console.log('Test (' + id + '-' + i + ') completed',
                    data);

            }
        }

    }

}

function deploy () {

    let lambdaCfg;
    let lambdaSecrets;

    getJSON(
        FILE_LAMBDA_CFG,
        {
            printErrors: true,
            checkFileType: FILE_LAMBDA_CFG
        },
        onLambdaConfig
    );
    getJSON(
        FILE_LAMBDA_SECRETS,
        {
            printErrors: true,
            checkFileType: FILE_LAMBDA_SECRETS
        },
        onLambdaAwsConfig
    );

    function onLambdaConfig (obj) {

        if (isObject(obj)) lambdaCfg = obj;
        continueDeploy();
    }

    function onLambdaAwsConfig (obj) {

        if (isObject(obj)) lambdaSecrets = obj;
        continueDeploy();
    }

    function continueDeploy () {

        if (isObject(lambdaCfg) && isObject(lambdaSecrets)) {

            // Check the current Lambda function (if any)
            awsDeploy(lambdaCfg, lambdaSecrets);
        }
    }
}

/**
 * @param {Object} lambdaCfg
 * @param {Object} lambdaSecrets
 */
function awsDeploy (lambdaCfg, lambdaSecrets) {

    let getFunctionOptions;

    const lambdaOptions = {};
    lambdaOptions[K_API_VERSION] = AWS_LAMBDA_VERSION;
    lambdaOptions[K_REGION] = lambdaSecrets[K_REGION];

    switch (checkAuthentication(lambdaSecrets)) {
        case AUTH_TYPE_PROFILE:

            const credentials = new AWS.SharedIniFileCredentials({
                'profile': lambdaSecrets[K_PROFILE]
            });

            lambdaOptions[K_CREDENTIALS] = credentials;

            break;
        case AUTH_TYPE_KEYS:

            lambdaOptions[K_ACCESS_KEY_ID] =
                lambdaSecrets[K_ACCESS_KEY_ID];
            lambdaOptions[K_SECRET_ACCESS_KEY] =
                lambdaSecrets[K_SECRET_ACCESS_KEY];

            break;
    }

    const lambda = new AWS.Lambda(lambdaOptions);

    getFunctionOptions = {};
    getFunctionOptions[K_FUNCTION_NAME] = lambdaCfg[K_FUNCTION_NAME];

    lambda.getFunction(getFunctionOptions, onFunction);

    function onFunction (err, data) {

        if (err) {

            if (err.code === 'ResourceNotFoundException') {

                console.info(
                    'AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') was not found'
                );

                askConfirmation(
                    'Create AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ')?',
                    true,
                    (answer) => {

                        if (answer === true) {

                            createFunction(
                                lambda,
                                lambdaCfg,
                                lambdaSecrets
                            );

                        }
                    }
                );
            }
        } else {

            if (verbose) console.info('Lambda function retrieved', data);

            // Store the CodeSha256
            if (isNEString(data[K_CODE_SHA_256])) {

                codeSha256 = data[K_CODE_SHA_256];

            }

            if (force) {

                updateConfiguration(
                    lambda,
                    lambdaCfg,
                    lambdaSecrets
                );
                updateCode(
                    lambda,
                    lambdaCfg
                );

            } else if (!compareLambdaConfig(
                    data[K_CONFIGURATION],
                    lambdaCfg,
                    lambdaSecrets
                )) {

                askConfirmation(
                    'Update AWS Lambda function  (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') configuration?',
                    true,
                    (answer) => {

                        if (answer === true) {

                            updateConfiguration(
                                lambda,
                                lambdaCfg,
                                lambdaSecrets
                            );
                            updateCode(
                                lambda,
                                lambdaCfg
                            );

                        }
                    }
                );

            } else {

                updateCode(
                    lambda,
                    lambdaCfg
                );

            }
        }
    }
}

/**
 * Creates the AWS Lambda
 *
 * @param {Lambda} lambda
 * @param {Object} lambdaCfg
 * @param {Object} lambdaSecrets
 */
function createFunction (lambda, lambdaCfg, lambdaSecrets) {

    getZip(lambdaCfg[K_ARCHIVE_NAME], onZip);

    function onZip (err, zip) {

        if (!err) {

            const params = generateLambdaConfig(lambdaCfg, lambdaSecrets);

            params[K_CODE] = {};
            params[K_CODE][K_ZIP_FILE] = zip;

            lambda.createFunction(params, onCreateFunction);
        }
    }

    function onCreateFunction (err, data) {

        if (err) {

            console.error('Error creating AWS Lambda function', err);

        } else {

            if (verbose) {

                console.info('AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') created', data);

            } else {

                console.info('AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') created');

            }
        }
    }
}

/**
 * Updates the AWS Lambda configuration
 *
 * @param {Lambda} lambda
 * @param {Object} lambdaCfg
 * @param {Object} lambdaSecrets
 */
function updateConfiguration (lambda, lambdaCfg, lambdaSecrets) {

    const params = generateLambdaConfig(lambdaCfg, lambdaSecrets);

    lambda.updateFunctionConfiguration(params, onUpdateFunctionConfiguration);

    function onUpdateFunctionConfiguration (err, data) {

        if (err) {

            console.error('Error updating AWS Lambda configuration', err);

        } else {

            if (verbose) {

                console.info('AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') configuration updated',
                    data);

            } else {

                console.info('AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') configuration updated');
            }
        }
    }
}

/**
 * Uploads the AWS Lambda function
 *
 * @param {Lambda} lambda
 * @param {Object} lambdaCfg
 */
function updateCode (lambda, lambdaCfg) {

    getZip(lambdaCfg[K_ARCHIVE_NAME], onZip);

    const params = {};
    params[K_FUNCTION_NAME] = lambdaCfg[K_FUNCTION_NAME];
    params[K_PUBLISH] = lambdaCfg[K_PUBLISH];
    params[K_DRY_RUN] = true;

    function onZip (err, zip) {

        if (!err) {

            params[K_ZIP_FILE] = zip;

            if (force) {

                params[K_DRY_RUN] = false;
                lambda.updateFunctionCode(params, onUpdateFunction);

            } else {

                lambda.updateFunctionCode(params, onUpdateFunctionDry);

            }
        }
    }

    function onUpdateFunctionDry (err, data) {

        if (err) {

            console.error('Error updating AWS Lambda code Dry', err);

        } else {

            let newCodeSha256;

            if (isNEString(data[K_CODE_SHA_256])) {

                newCodeSha256 = data[K_CODE_SHA_256];

                if (newCodeSha256 === codeSha256) {

                    console.info('No need to update AWS Lambda function (' +
                        lambdaCfg[K_FUNCTION_NAME] + ')');

                } else {

                    params[K_DRY_RUN] = false;

                    lambda.updateFunctionCode(params, onUpdateFunction);

                }

            } else {

                console.warn('Invalid CodeSHA256');

                params[K_DRY_RUN] = false;

                lambda.updateFunctionCode(params, onUpdateFunction);

            }
        }
    }

    function onUpdateFunction (err, data) {

        if (err) {

            console.error('Error updating AWS Lambda code', err);

        } else {

            if (verbose) {

                console.info('AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') updated', data);

            } else {

                console.info('AWS Lambda function (' +
                    lambdaCfg[K_FUNCTION_NAME] + ') updated');

            }
        }
    }
}

// Helper functions

/**
 * @callback onZip
 * @param {*} err
 * @param {Buffer} zipBuffer
 */

/**
 * Reads the zip archive from the file system
 *
 * @param {string} zipName
 * @param {onZip} callback
 */
function getZip (zipName, callback) {

    fs.readFile(
        zipName,
        null,
        onFile
    );

    function onFile (err, data) {

        if (err) console.error('Error reading zip archive (' + zipName + ')');

        callback(err, data);

    }
}

/**
 * @param {Object} lambdaCfg
 * @param {Object} lambdaSecrets
 * @returns {Object}
 */
function generateLambdaConfig (lambdaCfg, lambdaSecrets) {
    let result = {};

    result[K_FUNCTION_NAME] = lambdaCfg[K_FUNCTION_NAME];
    result[K_DESCRIPTION] = lambdaCfg[K_DESCRIPTION];
    result[K_HANDLER] = lambdaCfg[K_HANDLER];
    result[K_RUNTIME] = lambdaCfg[K_RUNTIME];
    result[K_MEMORY_SIZE] = lambdaCfg[K_MEMORY_SIZE];
    result[K_TIMEOUT] = lambdaCfg[K_TIMEOUT];
    result[K_TAGS] = lambdaCfg[K_TAGS];
    result[K_PUBLISH] = lambdaCfg[K_PUBLISH];

    result[K_ROLE] = lambdaSecrets[K_ROLE];
    result[K_ENVIRONMENT] = lambdaSecrets[K_ENVIRONMENT];

    return result;
}

/**
 * Sets the default based on the file name
 *
 * @param {string} file
 */
function setDefaults (file) {

    switch (file) {
        case FILE_LAMBDA_CFG:

            DEFAULT_CFG[K_ARCHIVE_NAME] = 'archive.zip';
            DEFAULT_CFG[K_FUNCTION_NAME] = '';
            DEFAULT_CFG[K_DESCRIPTION] = '';
            DEFAULT_CFG[K_TAGS] = null;
            DEFAULT_CFG[K_HANDLER] = '';
            DEFAULT_CFG[K_PUBLISH] = false;
            DEFAULT_CFG[K_RUNTIME] = 'nodejs6.10';
            DEFAULT_CFG[K_MEMORY_SIZE] = 128;
            DEFAULT_CFG[K_TIMEOUT] = 3;

            break;
        case FILE_LAMBDA_SECRETS:

            DEFAULT_SECRETS[K_REGION] = '';
            DEFAULT_SECRETS[K_PROFILE] = '';
            DEFAULT_SECRETS[K_ACCESS_KEY_ID] = '';
            DEFAULT_SECRETS[K_SECRET_ACCESS_KEY] = '';
            DEFAULT_SECRETS[K_ROLE] = '';
            DEFAULT_SECRETS[K_ENVIRONMENT] = null;

            break;
    }
}

/**
 * @typedef {Object} GetJSONOptions
 * @property {boolean} printErrors
 * @property {string} checkFileType
 */

/**
 * @callback onConfig
 * @param {?Object} config
 */

/**
 * Retrieves the specified json file
 *
 * @param {string} file
 * @param {GetJSONOptions} options
 * @param {onConfig} callback
 */
function getJSON (file, options, callback) {

    fs.readFile(file, 'utf8', onFile);

    function onFile (err, data) {

        let errorMessage = '';
        let isValid = false;

        if (err) {

            errorMessage = 'Invalid ' + file + ' file';
            if (options.printErrors) console.error(errorMessage);

        } else {

            let object;

            try {

                object = JSON.parse(data);

            } catch (err) {

                errorMessage = 'Invalid JSON ' + file;
                if (options.printErrors) console.error(errorMessage);
            }

            if (object) {

                if (isNEString(options.checkFileType)) {

                    if (checkJSONObject(object, options)) {

                        // Config is valid and checked
                        isValid = true;
                        callback(object);

                    } else {

                        errorMessage = 'Invalid object ' + file;

                    }

                } else {

                    // Config is valid
                    isValid = true;
                    callback(object);

                }
            }
        }

        if (!isValid) callback(errorMessage);
    }
}

/**
 * @param {string} file
 * @param {Object} object
 */
function writeJSON (file, object) {

    fs.writeFile(
        file,
        JSON.stringify(object, null, 2) + os.EOL,
        'utf8',
        onWrite
    );

    function onWrite (err) {

        if (err) console.error('Error writing ' + file);
    }
}

/**
 * @param {Object|Array} object
 * @param {GetJSONOptions} options
 * @returns {boolean}
 */
function checkJSONObject (object, options) {
    let result;

    result = isObject(object);

    if (result) {

        switch (options.checkFileType) {
            case FILE_LAMBDA_CFG:

                checkNEString(K_ARCHIVE_NAME);
                checkNEString(K_FUNCTION_NAME);
                checkNEString(K_HANDLER);

                break;
            case FILE_LAMBDA_SECRETS:

                checkNEString(K_REGION);
                checkNEString(K_ROLE);

                break;
            case DEFAULT_FILE_TESTS:

                console.log('Check tests', object);

                if (Array.isArray(object)) {

                    let i, length;
                    length = object.length;
                    for (i = 0; i < length; i++) {

                        if (!(isObject(object[i]) &&
                            Array.isArray(object[i].events))) {

                            result = false;
                        }
                    }

                } else {

                    result = false;
                }

                break;
            default:

                result = false;
        }

    } else {

        if (options.printErrors) {

            console.error('Invalid ' + options.checkFileType);

        }

    }

    return result;

    function checkNEString (property) {
        let isValid;

        isValid = isNEString(object[property]);

        if (options.printErrors && !isValid) {

            console.error('Invalid ' + property);

        }

        result = result === true && isValid;
    }
}

/**
 * @param {Object} config
 * @returns {string}
 */
function checkAuthentication (config) {

    if (isObject(config)) {

        if (isNEString(config[K_PROFILE])) return AUTH_TYPE_PROFILE;

        if (isNEString(config[K_ACCESS_KEY_ID]) &&
            isNEString(config[K_SECRET_ACCESS_KEY])) {

            return AUTH_TYPE_KEYS;
        }
    }

    return '';
}

/**
 * Checks lambda configuration. Returns true if equal
 *
 * @param {Object} actualLambdaCfg
 * @param {Object} lambdaCfg
 * @param {Object} lambdaSecrets
 * @returns {boolean}
 */
function compareLambdaConfig (actualLambdaCfg,
                              lambdaCfg,
                              lambdaSecrets) {
    let result;

    if (isObject(actualLambdaCfg) && isObject(lambdaCfg)) {

        result = true;

        checkProperty(lambdaSecrets, K_ROLE);
        checkProperty(lambdaCfg, K_DESCRIPTION);
        checkProperty(lambdaCfg, K_HANDLER);
        checkProperty(lambdaCfg, K_RUNTIME);
        checkProperty(lambdaCfg, K_MEMORY_SIZE);
        checkProperty(lambdaCfg, K_TIMEOUT);

        // Environment
        result = (
            result === true &&
            compareEnvironment(
                actualLambdaCfg[K_ENVIRONMENT],
                lambdaSecrets[K_ENVIRONMENT]
            )
        );

    } else {

        result = false;
    }

    return result;

    function checkProperty (obj, property) {

        result = (
            result === true &&
            actualLambdaCfg[property] === obj[property]
        );
    }
}

/**
 * Prints CLI usage
 */
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

/**
 * @callback onResponse
 * @param {boolean} response
 */

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


/**
 * Returns true if equal
 *
 * @param {Object} env1
 * @param {Object} env2
 * @returns {boolean}
 */
function compareEnvironment (env1, env2) {

    if ((isEmpty(env1) || isObject(env1) && isEmpty(env1[K_VARIABLES])) &&
        (isEmpty(env2) || isObject(env2) && isEmpty(env2[K_VARIABLES]))) {

        return true;

    } else if (isObject(env2) &&
        isObject(env2[K_VARIABLES]) &&
        Object.keys(env2[K_VARIABLES]).length > 0 &&
        (isEmpty(env1) || isObject(env1) && isEmpty(env1[K_VARIABLES]))) {

        return false;

    } else if (isObject(env1) &&
        isObject(env1[K_VARIABLES]) &&
        Object.keys(env1[K_VARIABLES]).length > 0 &&
        (isEmpty(env2) || isObject(env2) && isEmpty(env2[K_VARIABLES]))) {

        return false;

    } else if (isObject(env1) && isObject(env1[K_VARIABLES]) &&
        isObject(env2) && isObject(env2[K_VARIABLES])) {

        let k1 = Object.keys(env1[K_VARIABLES]);
        let k2 = Object.keys(env2[K_VARIABLES]);

        let l1 = k1.length;
        let l2 = k2.length;

        if (l1 === l2) {

            let i;
            for (i = 0; i < l1; i++) {

                if (env1[K_VARIABLES][k1[i]] !== env2[K_VARIABLES[k1[i]]]) {

                    return false;
                }
            }

            return true;

        } else {

            return false;
        }

    } else {

        return false;
    }
}

/**
 * Checks whether a given variable is null, undefined, an empty object
 * or an empty Array
 *
 * @param {*} obj
 * @returns {boolean}
 */
function isEmpty (obj) {
    return (
        obj === undefined ||
        obj === null ||
        (isObject(obj) && Object.keys(obj).length === 0) ||
        (Array.isArray(obj) && obj.length === 0)
    );
}

/**
 * Checks for non-null object
 *
 * @param {Object} obj
 * @returns {boolean}
 */
function isObject (obj) {
    return (
        typeof obj === 'object' &&
        obj !== null
    );
}

/**
 * Checks for non-empty string
 *
 * @param {string} string
 * @returns {boolean}
 */
function isNEString (string) {
    return (
        typeof string === 'string' &&
        string.length > 0
    );
}
