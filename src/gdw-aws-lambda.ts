
import * as fs from 'fs';
import * as os from "os";

import {SharedIniFileCredentials} from "aws-sdk";
import {
    ClientConfiguration,
    CreateFunctionRequest,
    FunctionConfiguration,
    GetFunctionResponse,
    UpdateFunctionCodeRequest
} from "aws-sdk/clients/lambda";
import Lambda = require("aws-sdk/clients/lambda");

type LambdaRuntime = 'nodejs6.10' | 'nodejs4.3';

interface LambdaConfig {
    readonly archiveName: string,
    readonly FunctionName: string,
    readonly Description: string,
    readonly Handler: string,
    readonly Publish: boolean,
    readonly Runtime: LambdaRuntime,
    readonly MemorySize: number,
    readonly Timeout: number
}

interface LambdaSecrets {
    readonly region: string,
    readonly profile: string,
    readonly accessKeyId: string,
    readonly secretAccessKey: string,
    readonly Role: string,
    readonly Environment: {
        readonly Variables: {
            readonly [property: string]: string
        }
    }
}

interface LambdaTest {
    readonly name?: string,
    readonly context: object,
    readonly events: Array<object>
}

interface DeployOptions {
    readonly create?: boolean,
    readonly updateConfig?: boolean
}

function isLambadConfig (obj: any): obj is LambdaConfig {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        obj.hasOwnProperty('archiveName') &&
        obj.hasOwnProperty('FunctionName') &&
        obj.hasOwnProperty('Description') &&
        obj.hasOwnProperty('Handler') &&
        obj.hasOwnProperty('Publish') &&
        obj.hasOwnProperty('Runtime') &&
        obj.hasOwnProperty('MemorySize') &&
        obj.hasOwnProperty('Timeout')
    );

}

function isLambdaSecrets (obj: any): obj is LambdaSecrets {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        obj.hasOwnProperty('region') &&
        obj.hasOwnProperty('profile') &&
        obj.hasOwnProperty('accessKeyId') &&
        obj.hasOwnProperty('secretAccessKey') &&
        obj.hasOwnProperty('Role') &&
        obj.hasOwnProperty('Environment')
    );
}

function isLambdaTest (obj: any): obj is LambdaTest {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        obj.hasOwnProperty('context') &&
        obj.hasOwnProperty('events')
    );
}

function isNEString (value: any): boolean {
    return (
        typeof value === 'string' &&
        value.length > 0
    );
}

class GdwAwsLambda {

    private lambda: Lambda;
    private lambdaCfg: LambdaConfig;
    private lambdaSecrets: LambdaSecrets;

    private lambdaGetInfo: GetFunctionResponse;

    public static readonly FILE_LAMBDA_CONFIG = 'lambda-config.json';
    public static readonly FILE_LAMBDA_SECRETS = 'lambda-secrets.json';
    public static readonly FILE_LAMBDA_TESTS = 'lambda-tests.json';

    public static readonly INFO_FUNCTION_CODE_UO_TO_DATE =
        'Function code up-to-date';
    public static readonly INFO_DEPLOY_COMPLETE = '' +
        'Lambda function deploy finished';

    public static readonly ERR_LAMBDA_NOT_FOUND = 'Lambda not found';
    public static readonly ERR_LAMBDA_CONFIG = 'Lambda config different';

    private static readonly AWS_LAMBDA_VERSION = '2015-03-31';

    public init (): Promise<Array<string>> {

        return Promise.all([
            this.checkAndInit(
                GdwAwsLambda.FILE_LAMBDA_CONFIG,
                GdwAwsLambda.FILE_LAMBDA_CONFIG
            ),
            this.checkAndInit(
                GdwAwsLambda.FILE_LAMBDA_SECRETS,
                GdwAwsLambda.FILE_LAMBDA_SECRETS
            ),
            this.checkAndInit(
                GdwAwsLambda.FILE_LAMBDA_TESTS,
                GdwAwsLambda.FILE_LAMBDA_TESTS
            )
        ]);

    }

    public deploy (options?: DeployOptions) {

        return this.createLambdaService()
            .then(() => {

                return this.checkLambda(options);

            })
            .then((result: string | GetFunctionResponse) => {

                if (result === GdwAwsLambda.ERR_LAMBDA_NOT_FOUND) {

                    return this.createFunction();

                } else {

                    let promises = [];

                    if (options && options.updateConfig) {

                        promises.push(this.updateConfig());

                    } else {

                        if (!this.checkLambdaConfig(this.lambdaGetInfo)) {

                            return Promise
                                .reject(GdwAwsLambda.ERR_LAMBDA_CONFIG);

                        }

                    }

                    promises.push(this.updateFunctionCode());

                    return Promise.all(promises)
                        .then(() => {

                            return GdwAwsLambda.INFO_DEPLOY_COMPLETE;

                        });

                }

            });

    }

    private createLambdaService (): Promise<Lambda> {

        return this.readConfig()
            .then(() => {

                let lambdaOptions: ClientConfiguration = {
                    apiVersion: GdwAwsLambda.AWS_LAMBDA_VERSION,
                    region: this.lambdaSecrets.region
                };

                // Authentication

                if (isNEString(this.lambdaSecrets.profile)) {

                    lambdaOptions.credentials = new SharedIniFileCredentials({
                        profile: this.lambdaSecrets.profile
                    });

                } else if (isNEString(this.lambdaSecrets.accessKeyId) &&
                    isNEString(this.lambdaSecrets.secretAccessKey)) {

                    lambdaOptions.accessKeyId =
                        this.lambdaSecrets.accessKeyId;
                    lambdaOptions.secretAccessKey =
                        this.lambdaSecrets.secretAccessKey;

                }

                this.lambda = new Lambda(lambdaOptions);

                return this.lambda;

            });

    }

    private checkLambda (options?: DeployOptions)
    : Promise<string|GetFunctionResponse> {

        return new Promise((resolve, reject) => {

            this.lambda.getFunction(
                {
                    FunctionName: this.lambdaCfg.FunctionName
                },
                (err, data) => {

                    if (err) {

                        if (err.code === 'ResourceNotFoundException') {

                            if (options && options.create) {

                                resolve(GdwAwsLambda.ERR_LAMBDA_NOT_FOUND);

                            } else {

                                reject(GdwAwsLambda.ERR_LAMBDA_NOT_FOUND);

                            }

                        } else {

                            reject('Lambda getFunction Error');

                        }

                    } else  {

                        // Store Lambda information
                        this.lambdaGetInfo = data;

                        resolve(this.lambdaGetInfo);

                    }

                }
            );
        });
    }

    private checkLambdaConfig (config: Lambda.FunctionConfiguration): boolean {

        return (
            config &&
            config.FunctionName === this.lambdaCfg.FunctionName &&
            config.Description === this.lambdaCfg.Description &&
            config.Handler === this.lambdaCfg.Handler &&
            config.Runtime === this.lambdaCfg.Runtime &&
            config.MemorySize === this.lambdaCfg.MemorySize &&
            config.Timeout === this.lambdaCfg.Timeout &&
            config.Role === this.lambdaSecrets.Role
        );

    }

    private createFunction () {

        return this.readArchive()
            .then((result) => {

                let params: CreateFunctionRequest = {
                    FunctionName: this.lambdaCfg.FunctionName,
                    Description: this.lambdaCfg.Description,
                    Handler: this.lambdaCfg.Handler,
                    Runtime: this.lambdaCfg.Runtime,
                    MemorySize: this.lambdaCfg.MemorySize,
                    Timeout: this.lambdaCfg.Timeout,
                    Publish: this.lambdaCfg.Publish,
                    Role: this.lambdaSecrets.Role,
                    Code: {
                        ZipFile: result
                    }
                };

                this.lambda.createFunction(
                    params,
                    (err) => {

                        if (err) {

                            return Promise
                                .reject('Error creating Lambda function');
                        }

                        return 'Lambda function (' +
                            this.lambdaCfg.FunctionName + ') created';

                    });

            });

    }

    private updateFunctionCode () {

        return this.readArchive()
            .then((result) => {

                return this.updateCode({
                    FunctionName: this.lambdaCfg.FunctionName,
                    Publish: this.lambdaCfg.Publish,
                    ZipFile: result,
                    DryRun: true
                });

            })
            .then((result: FunctionConfiguration) => {

                if (this.lambdaGetInfo && this.lambdaGetInfo.Configuration) {

                    if (result.CodeSha256 !==
                        this.lambdaGetInfo.Configuration.CodeSha256) {

                        return this.updateCode({
                            FunctionName: this.lambdaCfg.FunctionName,
                            Publish: this.lambdaCfg.Publish,
                            ZipFile: result,
                            DryRun: false
                        });

                    } else {

                        return GdwAwsLambda.INFO_FUNCTION_CODE_UO_TO_DATE;

                    }

                } else {

                    // return Promise
                    //     .reject('Invalid Lambda function information');
                    throw 'Invalid Lambda function information';

                }

            });

    }

    private updateConfig () {

        return new Promise((resolve, reject) => {

            this.lambda.updateFunctionConfiguration({
                FunctionName: this.lambdaCfg.FunctionName,
                Description: this.lambdaCfg.Description,
                Handler: this.lambdaCfg.Handler,
                Runtime: this.lambdaCfg.Runtime,
                MemorySize: this.lambdaCfg.MemorySize,
                Timeout: this.lambdaCfg.Timeout,
                Role: this.lambdaSecrets.Role,
                Environment: this.lambdaSecrets.Environment
            }, (err, data) => {

                err ? reject('Error updating function configuration')
                    : resolve(data);

            })

        });

    }

    private updateCode (config: UpdateFunctionCodeRequest) {

        return new Promise((resolve, reject) => {

            this.lambda.updateFunctionCode(config, (err, data) => {

                if (err) {

                    reject(err);

                } else {

                    resolve(data);

                }

            })

        });

    }

    private readArchive () {

        return new Promise((resolve, reject) => {

            if (isNEString(this.lambdaCfg.archiveName)) {

                fs.readFile(
                    this.lambdaCfg.archiveName,
                    (err, data) => {

                        err ? reject('Archive ' + this.lambdaCfg.archiveName +
                            'not found')
                            : resolve(data);

                    }
                );

            } else {

                reject('Invalid archive name');

            }

        });

    }

    private readConfig () {

        return Promise.all([
            this.readObject(
                GdwAwsLambda.FILE_LAMBDA_CONFIG,
                GdwAwsLambda.FILE_LAMBDA_CONFIG
            ).then((cfg) => {

                if (isLambadConfig(cfg) &&
                    isNEString(cfg.FunctionName) &&
                    isNEString(cfg.Handler)) {

                    this.lambdaCfg = cfg;

                    return this.lambdaCfg;

                } else {

                    // return Promise.reject('Invalid Lambda config');
                    throw 'Invalid Lambda config';

                }

            }),
            this.readObject(
                GdwAwsLambda.FILE_LAMBDA_SECRETS,
                GdwAwsLambda.FILE_LAMBDA_SECRETS
            ).then((cfg): LambdaSecrets => {

                if (isLambdaSecrets(cfg) &&
                    isNEString(cfg.region) &&
                    isNEString(cfg.Role)) {

                    this.lambdaSecrets = cfg;

                    return this.lambdaSecrets;

                } else {

                    // return Promise.reject('Invalid Lambda secrets');
                    throw 'Invalid Lambda secrets';

                }

            })
        ]);

    }

    private checkAndInit (file: string, type: string): Promise<string> {

        return this.readObject(file, type)
            .catch(() => {

                return this.initFile(file);

            });
    }

    private initFile (file: string): Promise<string> {

        let obj = GdwAwsLambda
            .createObject(file);

        if (obj) {

            return this.writeObject(file, obj);

        } else {

            return Promise.reject(`Unable to create object for ${file}`);
        }

    }

    private readObject (file: string, checkType?: string)
        : Promise<object> {

        return new Promise((resolve, reject) => {

            fs.readFile(file, 'utf8', (err, data) => {

                if (err) {

                    reject(`Failed to read file ${file}`);

                } else {

                    let object;

                    try {

                        object = JSON.parse(data);

                    } catch (e) {

                        // return Promise.reject('Invalid JSON');
                       reject('Invalid JSON');

                    }

                    if (object) {

                        if (checkType) {

                            let result = GdwAwsLambda
                                .checkObject(object, checkType);

                            result ? reject(result)
                                : resolve(object);

                        } else {

                            resolve(object);
                        }

                    }

                }

            });

        });
    }

    private writeObject (file: string, object: object): Promise<string> {

        return new Promise((resolve, reject) => {

            fs.writeFile(
                file,
                JSON.stringify(object, null, 2) + os.EOL,
                'utf8',
                (err) => {

                    err ? reject(`Failed to write file ${file}`)
                        : resolve(`File ${file} has been written`);

                });

        });
    }

    private static checkObject (object: LambdaConfig |
                                    LambdaSecrets |
                                    Array<LambdaTest>,
                                checkType: string): string {

        switch (checkType) {
            case GdwAwsLambda.FILE_LAMBDA_CONFIG:

                if (isLambadConfig(object)) {

                    return '';

                } else {

                    return 'Invalid lambda config';
                }

            case GdwAwsLambda.FILE_LAMBDA_SECRETS:

                if (isLambdaSecrets(object)) {

                    return '';

                } else {

                    return 'Invalid lambda secrets';
                }

            case GdwAwsLambda.FILE_LAMBDA_TESTS:

                if (Array.isArray(object)) {

                    let i, length;
                    length = object.length;

                    for (i = 0; i < length; i++) {

                        if (!isLambdaTest(object[i])) {

                            return 'Invalid lambda tests';
                        }
                    }

                    return '';

                } else {

                    return 'Invalid lambda tests';
                }

            default:

                return `Invalid check type ${checkType}`;
        }
    }

    private static createObject (type: string): LambdaConfig |
        LambdaSecrets |
        Array<LambdaTest> |
        null {

        switch (type) {
            case GdwAwsLambda.FILE_LAMBDA_CONFIG:

                return {
                    archiveName: '',
                    FunctionName: '',
                    Description: '',
                    Handler: '',
                    Publish: false,
                    Runtime: 'nodejs6.10',
                    MemorySize: 128,
                    Timeout: 3
                };

            case GdwAwsLambda.FILE_LAMBDA_SECRETS:

                return {
                    region: '',
                    profile: '',
                    accessKeyId: '',
                    secretAccessKey: '',
                    Role: '',
                    Environment: {
                        Variables: {}
                    }
                };

            case GdwAwsLambda.FILE_LAMBDA_TESTS:

                return [
                    {
                        context: {},
                        events: []
                    }
                ];

            default:
                return null;
        }

    }
}

module.exports = new GdwAwsLambda();
