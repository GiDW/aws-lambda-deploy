export type LambdaRuntime = 'nodejs6.10' | 'nodejs4.3';

export interface DeployOptions {
    readonly create?: boolean,
    readonly updateConfig?: boolean
}

export interface LambdaConfig {
    readonly archiveName: string,
    readonly FunctionName: string,
    readonly Description: string,
    readonly Handler: string,
    readonly Publish: boolean,
    readonly Runtime: LambdaRuntime,
    readonly MemorySize: number,
    readonly Timeout: number
}

export interface LambdaSecrets {
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

export interface LambdaTest {
    readonly name?: string,
    readonly context: object,
    readonly events: Array<object>
}

export default class GdwAwsLambdaType {

    static isLambdaConfig (obj: any): obj is LambdaConfig {
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

    static isLambdaSecrets (obj: any): obj is LambdaSecrets {
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

    static isLambdaTest (obj: any): obj is LambdaTest {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            obj.hasOwnProperty('context') &&
            obj.hasOwnProperty('events')
        );
    }

    static isLambdaTests (obj: any): obj is LambdaTest[] {

        if (Array.isArray(obj)) {

            let i, length;

            length = obj.length;
            for (i = 0; i < length; i++) {

                if (!GdwAwsLambdaType.isLambdaTest(obj[i])) return false;
            }

            return true;

        }

        return false;
    }
}
