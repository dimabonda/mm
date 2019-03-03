function openPromise(){
    let resolve, reject;

    let np = new Promise((ok, fail) => {resolve = ok; reject = fail});

    np.resolve = resolve;
    np.reject  = reject;

    return np
}

function asynchronize({s, chunkEventName, endEventName}){
    return function* (){
        const chunks        = {};
        const promises      = {};

        const clear = i => (delete chunks[i], delete promises[i])


        let   chunkCount    = 0;
        let   promiseCount  = 0;
        let   end           = false;

        if (!('on' in s)){ //no on method in browser
            s.on = function(eventName, callback){ //polyfill
                this['on' + eventName] = callback;
            }
        }


        //check availability of chunk and promise. If any, resolve promise, and clear both from queue 
        const chunkAndPromise = i  =>   (i in chunks) && 
                                        (i in promises) && (
                                            promises[i].resolve(chunks[i]),
                                            clear(i))


        s.on(chunkEventName, data => {
            chunks[chunkCount] = data

            chunkAndPromise(chunkCount)

            chunkCount++
        })

        s.on(endEventName, () => {
            end = true;

        })

        while (!end || Object.keys(chunks).length){

            let p;
            promises[promiseCount] = p = openPromise();

            chunkAndPromise(promiseCount)

            promiseCount++;
            yield p; //yield promise outside
        }

        for (let i in promises){ //when end and chunks are exhausted
            promises[i].reject(new Error('End Of S')) //reject all left promises
        }
    }
}

module.exports = {openPromise, asynchronize}
