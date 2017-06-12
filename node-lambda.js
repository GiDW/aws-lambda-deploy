#!/usr/bin/env node

'use strict';

const os = require('os');
const fs = require('fs');
const readline = require('readline');

const AWS = require('aws-sdk');

const CMD_INIT = 'init';
const CMD_TEST = 'test';
const CMD_DEPLOY = 'deploy';

const FILE_LAMBDA_CFG = 'lambda-config.json';
const FILE_LAMBDA_AWS_CFG = 'lambda-aws-config.json';

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
const DEFAULT_AWS_CFG = {};

let verbose = false;
let codeSha256 = '';

// Set defaults
setDefaults(FILE_LAMBDA_CFG);
setDefaults(FILE_LAMBDA_AWS_CFG);

processCommand();

function processCommand () {

    if (process.argv[3] === '-d') {

        verbose = true;

    }

    switch (process.argv[2]) {
        case CMD_INIT:

            init();

            break;
        case CMD_TEST:
            break;
        case CMD_DEPLOY:

            deploy();

            break;
        default:

            printUsage();
    }
}

function init () {

    const getConfgiOptions = {
        check: false,
        init: true
    };

    getConfig(FILE_LAMBDA_CFG, getConfgiOptions, onLambdaConfig);
    getConfig(FILE_LAMBDA_AWS_CFG, getConfgiOptions, onLambdaAwsConfig);

    function onLambdaConfig (obj) {

        if (!isObject(obj)) writeConfig(FILE_LAMBDA_CFG, DEFAULT_CFG);
    }

    function onLambdaAwsConfig (obj) {

        if (!isObject(obj)) writeConfig(FILE_LAMBDA_AWS_CFG, DEFAULT_AWS_CFG);
    }
}

function deploy () {

    const getConfgiOptions = {
        check: true,
        init: false
    };

    let lambdaCfg;
    let lambdaAwsCfg;

    getConfig(FILE_LAMBDA_CFG, getConfgiOptions, onLambdaConfig);
    getConfig(FILE_LAMBDA_AWS_CFG, getConfgiOptions, onLambdaAwsConfig);

    function onLambdaConfig (obj) {

        if (isObject(obj)) lambdaCfg = obj;
        continueDeploy();
    }

    function onLambdaAwsConfig (obj) {

        if (isObject(obj)) lambdaAwsCfg = obj;
        continueDeploy();
    }

    function continueDeploy () {

        if (isObject(lambdaCfg) && isObject(lambdaAwsCfg)) {

            // Check the current Lambda function (if any)
            awsDeploy(lambdaCfg, lambdaAwsCfg);
        }
    }
}

/**
 * @param {Object} lambdaCfg
 * @param {Object} lambdaAwsCfg
 */
function awsDeploy (lambdaCfg, lambdaAwsCfg) {

    let getFunctionOptions;

    const lambdaOptions = {};
    lambdaOptions[K_API_VERSION] = AWS_LAMBDA_VERSION;
    lambdaOptions[K_REGION] = lambdaAwsCfg[K_REGION];

    switch (checkAuthentication(lambdaAwsCfg)) {
        case AUTH_TYPE_PROFILE:

            const credentials = new AWS.SharedIniFileCredentials({
                'profile': lambdaAwsCfg[K_PROFILE]
            });

            lambdaOptions[K_CREDENTIALS] = credentials;

            break;
        case AUTH_TYPE_KEYS:

            lambdaOptions[K_ACCESS_KEY_ID] =
                lambdaAwsCfg[K_ACCESS_KEY_ID];
            lambdaOptions[K_SECRET_ACCESS_KEY] =
                lambdaAwsCfg[K_SECRET_ACCESS_KEY];

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
                                lambdaAwsCfg
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

            if (!compareLambdaConfig(
                    data[K_CONFIGURATION],
                    lambdaCfg,
                    lambdaAwsCfg
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
                                lambdaAwsCfg
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
 * @param {Object} lambdaAwsCfg
 */
function createFunction (lambda, lambdaCfg, lambdaAwsCfg) {

    getZip(lambdaCfg[K_ARCHIVE_NAME], onZip);

    function onZip (err, zip) {

        if (!err) {

            const params = generateLambdaConfig(lambdaCfg, lambdaAwsCfg);

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
 * @param {Object} lambdaAwsCfg
 */
function updateConfiguration (lambda, lambdaCfg, lambdaAwsCfg) {

    const params = generateLambdaConfig(lambdaCfg, lambdaAwsCfg);

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

            lambda.updateFunctionCode(params, onUpdateFunctionDry);
        }
    }

    function onUpdateFunctionDry (err, data) {

        if (err) {

            console.error('Error updating AWS Lambda code', err);

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
 * @param {Object} lambdaAwsCfg
 * @returns {Object}
 */
function generateLambdaConfig (lambdaCfg, lambdaAwsCfg) {
    let result = {};

    result[K_FUNCTION_NAME] = lambdaCfg[K_FUNCTION_NAME];
    result[K_DESCRIPTION] = lambdaCfg[K_DESCRIPTION];
    result[K_HANDLER] = lambdaCfg[K_HANDLER];
    result[K_RUNTIME] = lambdaCfg[K_RUNTIME];
    result[K_MEMORY_SIZE] = lambdaCfg[K_MEMORY_SIZE];
    result[K_TIMEOUT] = lambdaCfg[K_TIMEOUT];
    result[K_TAGS] = lambdaCfg[K_TAGS];
    result[K_PUBLISH] = lambdaCfg[K_PUBLISH];

    result[K_ROLE] = lambdaAwsCfg[K_ROLE];
    result[K_ENVIRONMENT] = lambdaAwsCfg[K_ENVIRONMENT];

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
        case FILE_LAMBDA_AWS_CFG:

            DEFAULT_AWS_CFG[K_REGION] = '';
            DEFAULT_AWS_CFG[K_PROFILE] = '';
            DEFAULT_AWS_CFG[K_ACCESS_KEY_ID] = '';
            DEFAULT_AWS_CFG[K_SECRET_ACCESS_KEY] = '';
            DEFAULT_AWS_CFG[K_ROLE] = '';
            DEFAULT_AWS_CFG[K_ENVIRONMENT] = null;

            break;
    }
}

/**
 * @typedef {Object} GetConfigOptions
 * @property {boolean} check
 * @property {boolean} init
 */

/**
 * @callback onConfig
 * @param {?Object} config
 */

/**
 * Retrieves the specified config and checks for errors
 *
 * @param {string} file
 * @param {GetConfigOptions} options
 * @param {onConfig} callback
 */
function getConfig (file, options, callback) {

    fs.readFile(file, 'utf8', onLambdaConfig);

    function onLambdaConfig (err, data) {

        let isValid = false;

        if (err) {

            if (!options.init) console.error('Invalid ' + file + ' file');

        } else {

            let lambdaConfig;

            try {

                lambdaConfig = JSON.parse(data);

            } catch (err) {

                console.error('Invalid JSON ' + file);
            }

            if (lambdaConfig) {

                if (options.check) {

                    if (checkLambdaConfig(lambdaConfig, file)) {

                        // Config is valid and checked
                        isValid = true;
                        callback(lambdaConfig);

                    }
                } else {

                    // Config is valid
                    isValid = true;
                    callback(lambdaConfig);

                }
            }
        }

        if (!isValid) callback(null);
    }
}

/**
 * @param {string} file
 * @param {Object} config
 */
function writeConfig (file, config) {

    fs.writeFile(
        file,
        JSON.stringify(config, null, 2) + os.EOL,
        'utf8',
        onWrite
    );

    function onWrite (err) {

        if (err) console.error('Error writing ' + file);
    }
}

/**
 * @param {object} config
 * @param {string} file
 * @returns {boolean}
 */
function checkLambdaConfig (config, file) {
    let result;

    result = isObject(config);

    if (result) {

        switch (file) {
            case FILE_LAMBDA_CFG:

                checkNEString(K_ARCHIVE_NAME);
                checkNEString(K_FUNCTION_NAME);
                checkNEString(K_HANDLER);

                break;
            case FILE_LAMBDA_AWS_CFG:

                checkNEString(K_REGION);
                checkNEString(K_ROLE);

                break;
            default:

                result = false;
        }

    } else {

        console.error('Invalid ' + file);
    }

    return result;

    function checkNEString (property) {
        let isValid;

        isValid = isNEString(config[property]);
        if (!isValid) console.error('Invalid ' + property);

        result = result === true && isValid;
    }
}

/**
 *
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
 * @param {Object} lambdaAwsCfg
 * @returns {boolean}
 */
function compareLambdaConfig (actualLambdaCfg,
                              lambdaCfg,
                              lambdaAwsCfg) {
    let result;

    if (isObject(actualLambdaCfg) && isObject(lambdaCfg)) {

        result = true;

        checkProperty(lambdaAwsCfg, K_ROLE);
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
                lambdaAwsCfg[K_ENVIRONMENT]
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

    if (defaultAnswer === true) options += ' [Y/n]: ';
    if (defaultAnswer === false) options += ' [y/N]: ';

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
