declare module "opn" {
    interface Options {
        wait?: boolean;
        app?: string | string[];
    }
    function opn(target: string, options?: Options): Promise<void>;
    export default opn;
}
