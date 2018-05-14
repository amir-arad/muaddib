export function delay(delayMS: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, delayMS)
    })
}

export function poll(expect: () => void, timeout: number = 1000, interval: number = 10): Promise<void> {
    let passedInterval: number = 0;
    return new Promise((resolve, reject) => {
        const onInterval = async () => {
            passedInterval += interval;
            try {
                await expect();
                resolve();
            } catch (error) {
                if (passedInterval > timeout) {
                    reject(error);
                }else{
                    setTimeout(onInterval, interval);
                }
            }
        };
        const intervalID = setTimeout(onInterval, interval);

        
    })

}



