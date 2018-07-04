
export type ErrorMsgProvider = string | (() => string) | (() => Promise<string>);

export async function timeout<T>(timeout: number, errorMessage: ErrorMsgProvider, subj: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise((resolve) => {
        timer = setTimeout(resolve, timeout)
    }).then(async () => {
        if (typeof errorMessage === 'function') {
            throw new Error(await errorMessage());
        } else {
            throw new Error(errorMessage);
        }
    });
    const result = await Promise.race([
        subj,
        timeoutPromise
    ]);
    clearTimeout(timer!);
    return result;
}
