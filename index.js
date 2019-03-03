const MongoClient = require("mongodb").MongoClient;
const ObjectID    = require("mongodb").ObjectID;
const mm          = require('./mm.js')
const delay       = ms => new Promise(r => setTimeout(r.bind(ms), ms))
 
;(async () => {
    const mongoClient = new MongoClient("mongodb://localhost:27017/", { useNewUrlParser: true });
    const client      = await mongoClient.connect()
    const db          = client.db('mm')
    const Savable     = mm(db)

    //while(true){
        //await (new Savable({timestamp: (new Date).getTime(), r: Math.random()})).save()
        //let person = new Savable({
            //name: 'Mykola',
            //surname: 'Silniy',
            //phones: ['105', '1'],
            //children: [
                //new Savable({
                    //name: 'Marina',
                    //surname: 'Silnaya',
                    //phones: ['105', '1000503']
                //}),
                //new Savable({
                    //name: 'Andrey',
                    //surname: 'Silniy',
                    //phones: ['103', '1000502']
                //}),
                //new Savable({
                    //name: 'Fedor',
                    //surname: 'Ivanova',
                    //phones: ['102', '1000504'],
                    //notebook: new Savable({
                        //brand: 'dubovo'
                    //})
                //})
            //]
        //})

        //await person.save()
        //console.log(person)

        //await delay(3000)
    //}

    let person = new Savable()
    person._id = ObjectID('5c7bd603ce3cbc409978203e');
    console.log(person)

    let child = new Savable({
        name: 'New One Child',
        surname: 'Silniy',
        phones: ['105', '1000506']
    });

    console.log(await person)
    console.log(await person.children[10])
    console.log(await person.children[10].father)
    console.log(await person.children[10].father.children[9])
    //console.log(await person.children[1])
    ;(await person).children.push(child)
    child.father = person

    //console.log(person)
    //console.log(child)

    await person.save()

    //let obj = {
        //then(cb){
            //process.nextTick(() => cb(obj))
        //}
    //}
    //console.log(await obj)
    //console.log('empty await', await person)//.then(p => console.log(p))
    //console.log('sub await', (await person.children[0]))//.then(p => console.log(p))



    client.close();
})()
