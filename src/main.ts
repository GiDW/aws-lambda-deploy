
// Node JS dependencies
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// AWS SDK dependencies
import {SharedIniFileCredentials} from 'aws-sdk';
import {
    ClientConfiguration,
    CreateFunctionRequest,
    EnvironmentResponse,
    FunctionConfiguration,
    GetFunctionResponse,
    UpdateFunctionCodeRequest,
    UpdateFunctionConfigurationRequest
} from 'aws-sdk/clients/lambda';
import Lambda = require('aws-sdk/clients/lambda');

// Local dependencies
import Util from './Util';
import {
    DeployOptions,
    LambdaConfig,
    LambdaSecrets,
    LambdaTest
} from './types';
import GdwAwsLambdaType from './types';

class GdwAwsLambda {

    private lambda: Lambda;
    private lambdaCfg: LambdaConfig;
    private lambdaSecrets: LambdaSecrets;
    private lambdaTests: LambdaTest[];

    private lambdaBuffer: Buffer;

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

    //region Entry methods

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

                    return this.createLambdaFunction();

                } else {

                    let promises = [];

                    if (options && options.updateConfig) {

                        promises.push(this.updateLambdaConfig());

                    } else {

                        if (!this.checkLambdaConfig(this.lambdaGetInfo)) {

                            return Promise
                                .reject(GdwAwsLambda.ERR_LAMBDA_CONFIG);

                        }

                    }

                    promises.push(this.updateLambdaFunctionCode());

                    return Promise.all(promises)
                        .then(() => {

                            return GdwAwsLambda.INFO_DEPLOY_COMPLETE;

                        });

                }

            });

    }

    public test (testFileName?: string) {

        let testFile = GdwAwsLambda.FILE_LAMBDA_TESTS;

        if (Util.isNEString(testFileName)) {
            testFile = testFileName;
        }

        return Promise.all([
            this.readObject(
                GdwAwsLambda.FILE_LAMBDA_CONFIG,
                GdwAwsLambda.FILE_LAMBDA_CONFIG
            ).then((cfg) => {

                if (GdwAwsLambdaType.isLambdaConfig(cfg) &&
                    Util.isNEString(cfg.FunctionName) &&
                    Util.isNEString(cfg.Handler)) {

                    this.lambdaCfg = cfg;

                    return this.lambdaCfg;

                } else {

                    // return Promise.reject('Invalid Lambda config');
                    throw 'Invalid Lambda config';

                }

            }),
            this.readObject(
                testFile,
                GdwAwsLambda.FILE_LAMBDA_TESTS
            ).then((obj) => {

                if (GdwAwsLambdaType.isLambdaTests(obj)) {

                    this.lambdaTests = obj;

                    return this.lambdaTests;

                } else {

                    // return Promise.reject('Invalid Lambda tests');
                    throw 'Invalid Lambda tests';
                }

            })
        ]).then(() => {

            return this.runTests();

        });

    }

    //endregion

    private createLambdaService (): Promise<Lambda> {

        return this.readConfig()
            .then(() => {

                let lambdaOptions: ClientConfiguration = {
                    apiVersion: GdwAwsLambda.AWS_LAMBDA_VERSION,
                    region: this.lambdaSecrets.region
                };

                // Authentication

                if (Util.isNEString(this.lambdaSecrets.profile)) {

                    lambdaOptions.credentials = new SharedIniFileCredentials({
                        profile: this.lambdaSecrets.profile
                    });

                } else if (Util.isNEString(this.lambdaSecrets.accessKeyId) &&
                    Util.isNEString(this.lambdaSecrets.secretAccessKey)) {

                    lambdaOptions.accessKeyId =
                        this.lambdaSecrets.accessKeyId;
                    lambdaOptions.secretAccessKey =
                        this.lambdaSecrets.secretAccessKey;

                }

                this.lambda = new Lambda(lambdaOptions);

                return this.lambda;

            });

    }

    private checkLambda (
        options?: DeployOptions
    ): Promise<string|GetFunctionResponse> {

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

    private checkLambdaConfig (config: GetFunctionResponse): boolean {

        let isEqual = (
            config &&
            config.Configuration &&
            config.Configuration &&
            config.Configuration.FunctionName === this.lambdaCfg.FunctionName &&
            config.Configuration.Description === this.lambdaCfg.Description &&
            config.Configuration.Handler === this.lambdaCfg.Handler &&
            config.Configuration.Runtime === this.lambdaCfg.Runtime &&
            config.Configuration.MemorySize === this.lambdaCfg.MemorySize &&
            config.Configuration.Timeout === this.lambdaCfg.Timeout &&
            config.Configuration.Role === this.lambdaSecrets.Role
        );

        if (config && config.Configuration && isEqual) {

            isEqual = GdwAwsLambda.compareEnvironment(
                config.Configuration.Environment,
                this.lambdaSecrets.Environment
            );
        }

        if (typeof isEqual === 'boolean') {
            return isEqual;
        } else {
            return false;
        }
    }

    private static compareEnvironment (
        env1: EnvironmentResponse | null | undefined,
        env2: EnvironmentResponse | null | undefined
    ): boolean {

        if ((Util.isEmpty(env1) || Util.isObject(env1) &&
            Util.isEmpty(env1.Variables)) &&
            (Util.isEmpty(env2) || Util.isObject(env2) &&
            Util.isEmpty(env2.Variables))) {

            return true;

        } else if (Util.isObject(env2) &&
            Util.isObject(env2.Variables) &&
            Object.keys(env2.Variables).length > 0 &&
            (Util.isEmpty(env1) || Util.isObject(env1) &&
            Util.isEmpty(env1.Variables))) {

            return false;

        } else if (Util.isObject(env1) &&
            Util.isObject(env1.Variables) &&
            Object.keys(env1.Variables).length > 0 &&
            (Util.isEmpty(env2) || Util.isObject(env2) &&
            Util.isEmpty(env2.Variables))) {

            return false;

        } else if (Util.isObject(env1) && Util.isObject(env1.Variables) &&
            Util.isObject(env2) && Util.isObject(env2.Variables)) {

            let k1 = Object.keys(env1.Variables);
            let k2 = Object.keys(env2.Variables);

            let l1 = k1.length;
            let l2 = k2.length;

            if (l1 === l2) {

                let i;
                for (i = 0; i < l1; i++) {

                    if (env1.Variables[k1[i]] !== env2.Variables[k1[i]]) {

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

    private createLambdaFunction () {

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

                return this.createFunction(params)
                    .then(
                        () => {

                            return 'Lambda function (' +
                                this.lambdaCfg.FunctionName + ') created';

                        }
                    );

            });

    }

    private updateLambdaConfig (): Promise<string> {

        let params: UpdateFunctionConfigurationRequest = {
            FunctionName: this.lambdaCfg.FunctionName,
            Description: this.lambdaCfg.Description,
            Handler: this.lambdaCfg.Handler,
            Runtime: this.lambdaCfg.Runtime,
            MemorySize: this.lambdaCfg.MemorySize,
            Timeout: this.lambdaCfg.Timeout,
            Role: this.lambdaSecrets.Role,
            Environment: this.lambdaSecrets.Environment
        };

        return this.updateConfig(params)
            .then(
                () => {

                    return 'Lambda function (' +
                        this.lambdaCfg.FunctionName +
                        ') configuration updated';

                }
            );

    }

    private updateLambdaFunctionCode (): Promise<string> {

        return this.readArchive()
            .then(() => {

                return this.updateFunctionCode({
                    FunctionName: this.lambdaCfg.FunctionName,
                    Publish: this.lambdaCfg.Publish,
                    ZipFile: this.lambdaBuffer,
                    DryRun: true
                });

            })
            .then((result: FunctionConfiguration) => {

                if (this.lambdaGetInfo && this.lambdaGetInfo.Configuration) {

                    if (result.CodeSha256 !==
                        this.lambdaGetInfo.Configuration.CodeSha256) {

                        return this.updateFunctionCode({
                            FunctionName: this.lambdaCfg.FunctionName,
                            Publish: this.lambdaCfg.Publish,
                            ZipFile: this.lambdaBuffer,
                            DryRun: false
                        })
                            .then(
                                () => {

                                    return 'Lambda function (' +
                                        this.lambdaCfg.FunctionName +
                                        ') code has been updated';

                                }
                            );

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

    //region AWS Lambda Promise wrappers

    private createFunction (
        params: CreateFunctionRequest
    ): Promise<FunctionConfiguration> {

        return new Promise((resolve, reject) => {

            this.lambda.createFunction(
                params,
                (err, data) => {

                    err ? reject(err)
                        : resolve(data);

                }
            );

        });

    }

    private updateConfig (
        params: UpdateFunctionConfigurationRequest
    ): Promise<FunctionConfiguration> {

        return new Promise((resolve, reject) => {

            // this.lambda.updateFunctionConfiguration({
            //     FunctionName: this.lambdaCfg.FunctionName,
            //     Description: this.lambdaCfg.Description,
            //     Handler: this.lambdaCfg.Handler,
            //     Runtime: this.lambdaCfg.Runtime,
            //     MemorySize: this.lambdaCfg.MemorySize,
            //     Timeout: this.lambdaCfg.Timeout,
            //     Role: this.lambdaSecrets.Role,
            //     Environment: this.lambdaSecrets.Environment
            // }, (err, data) => {
            //
            //     err ? reject('Error updating function configuration')
            //         : resolve(data);
            //
            // })

            this.lambda.updateFunctionConfiguration(
                params,
                (err, data) => {

                    err ? reject(err)
                        : resolve(data);

                }
            );

        });

    }

    private updateFunctionCode (
        params: UpdateFunctionCodeRequest
    ): Promise<FunctionConfiguration> {

        return new Promise((resolve, reject) => {

            this.lambda.updateFunctionCode(
                params,
                (err, data) => {

                    err ? reject(err)
                        : resolve(data);

                }
            );

        });

    }

    //endregion

    //region Lambda tests

    private runTests () {

        let splits;
        let module;
        let eventHandler;
        let filePath;

        // Extract module and handler name
        splits = this.lambdaCfg.Handler.split('.');

        if (splits.length !== 2) throw 'Invalid handler';

        module = splits[0];
        eventHandler = splits[1];

        filePath = path.join(process.cwd(), module + '.js');

        const handler = require(filePath)[eventHandler];

        if (!handler) throw 'invalid handler object';

        let promises = [];

        let i, length;

        length = this.lambdaTests.length;
        for (i = 0; i < length; i++) {

            promises.push(GdwAwsLambda.executeContextTest(
                handler,
                this.lambdaTests[i]
            ));
        }

        return Promise.all(promises);

    }

    private static executeContextTest (
        handler: Function,
        test: LambdaTest
    ) {

        let promises = [];

        let i, length;

        length = test.events.length;
        for (i = 0; i < length; i++) {

            promises.push(GdwAwsLambda.executeEventTest(
                handler,
                test.context,
                test.events[i]
            ));
        }

        return Promise.all(promises);

    }

    private static executeEventTest (
        handler: Function,
        context: object | null | undefined,
        event: object | null | undefined
    ) {

        return new Promise((resolve, reject) => {

            handler(event, context, (err: any, data: any) => {

                err ? reject(err)
                    : resolve(data);

            });

        });

    }

    //endregion

    //region File methods

    private readArchive () {

        return new Promise((resolve, reject) => {

            if (Util.isNEString(this.lambdaCfg.archiveName)) {

                fs.readFile(
                    this.lambdaCfg.archiveName,
                    (err, data) => {

                        if (err) {

                            reject('Archive ' + this.lambdaCfg.archiveName +
                                'not found');

                        } else {

                            this.lambdaBuffer = data;
                            resolve(this.lambdaBuffer);

                        }

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

                if (GdwAwsLambdaType.isLambdaConfig(cfg) &&
                    Util.isNEString(cfg.FunctionName) &&
                    Util.isNEString(cfg.Handler)) {

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

                if (GdwAwsLambdaType.isLambdaSecrets(cfg) &&
                    Util.isNEString(cfg.region) &&
                    Util.isNEString(cfg.Role)) {

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
            .then(
                () => {

                    return `File ${file} exists already`;

                },
                () => {

                    return this.initFile(file);

                }
            );
    }

    private initFile (file: string): Promise<string> {

        let obj = GdwAwsLambda
            .createObject(file);

        if (obj) {

            return this.writeObject(file, obj);

        } else {

            // return Promise.reject(`Unable to create object for ${file}`);
            throw `Unable to create object for ${file}`;
        }

    }

    private readObject (file: string, checkType?: string): Promise<object> {

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

    //endregion

    //region Static methods

    private static checkObject (
        object: LambdaConfig | LambdaSecrets | Array<LambdaTest>,
        checkType: string
    ): string {

        switch (checkType) {
            case GdwAwsLambda.FILE_LAMBDA_CONFIG:

                if (GdwAwsLambdaType.isLambdaConfig(object)) {

                    return '';

                } else {

                    return 'Invalid lambda config';
                }

            case GdwAwsLambda.FILE_LAMBDA_SECRETS:

                if (GdwAwsLambdaType.isLambdaSecrets(object)) {

                    return '';

                } else {

                    return 'Invalid lambda secrets';
                }

            case GdwAwsLambda.FILE_LAMBDA_TESTS:

                if (Array.isArray(object)) {

                    let i, length;
                    length = object.length;

                    for (i = 0; i < length; i++) {

                        if (!GdwAwsLambdaType.isLambdaTest(object[i])) {

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

    private static createObject (
        type: string
    ): LambdaConfig | LambdaSecrets | Array<LambdaTest> | null {

        switch (type) {
            case GdwAwsLambda.FILE_LAMBDA_CONFIG:

                return {
                    archiveName: 'archive.zip',
                    FunctionName: '',
                    Description: '',
                    Handler: 'index.handler',
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

    //endregion
}

module.exports = GdwAwsLambda;
