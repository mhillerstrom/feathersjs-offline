export = init;
declare function init(options: any): (app: any) => Service;
declare namespace init {
    export { Service };
}
declare class Service {
    constructor(app: any, options?: {});
    options: {};
}
declare namespace Service {
    export const remoteServices: any[];
    export const handlerInstalled: boolean;
    export function handleConnectionEvents(eventTxt: any): (value: any) => void;
}
