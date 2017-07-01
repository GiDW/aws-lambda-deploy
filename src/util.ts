export default class Util {

    /**
     * Checks for non-empty string
     *
     * @param {string} obj
     * @returns {boolean}
     */
    static isNEString (obj: any | null | undefined): obj is string {
        return (
            typeof obj === 'string' &&
            obj.length > 0
        );
    }

    /**
     * Checks for non-null object
     *
     * @param {Object} obj
     * @returns {boolean}
     */
    static isObject (obj: any | null | undefined): obj is object {
        return (
            typeof obj === 'object' &&
            obj !== undefined &&
            obj !== null
        );
    }

    /**
     * Checks whether a given variable is null, undefined, an empty object
     * or an empty Array
     *
     * @param {*} obj
     * @returns {boolean}
     */
    static isEmpty (obj: any | null | undefined): boolean {
        return (
            obj === undefined ||
            obj === null ||
            (Util.isObject(obj) && Object.keys(obj).length === 0) ||
            (Array.isArray(obj) && obj.length === 0)
        );
    }
}
