const MongoClient = require("mongodb").MongoClient;
const ObjectID    = require("mongodb").ObjectID;
const mm          = require('./mm.js')
const delay       = ms => new Promise(r => setTimeout(r.bind(ms), ms))
 
;(async () => {
    const mongoClient = new MongoClient("mongodb://localhost:27017/", { useNewUrlParser: true });
    const client      = await mongoClient.connect()
    const db          = client.db('mm')
    const Savable     = mm(db)

    class Notebook extends Savable{
        static get relations(){
            return {
                owner: "notebook"
            }
        }
    }

    class User extends Savable{
        static get relations(){
            return {
                children: "parent",
                parent: "children",
                notebook: "owner",
            }
        }
    }
    Savable.addClass(Notebook)
    Savable.addClass(User)
    

    let father = await Savable.m.User.findOne(ObjectID("5c9559dfbbf3d0049529f70b"))
    console.log(father)
    for (let child of father.children){
        console.log(await child)
        console.log(child.name, child.dirty)
    }

    //let person = new User({
        //name: 'Mykola',
        //surname: 'Silniy',
        //phones: ['105', '1'],
        //children: [
            //new User({
                //name: 'Marina',
                //surname: 'Silnaya',
                //phones: ['105', '1000503'],
            //}),
            //new User({
                //name: 'Andrey',
                //surname: 'Silniy',
                //phones: ['103', '1000502'],
            //}),
            //new User({
                //name: 'Fedor',
                //surname: 'Ivanova',
                //phones: ['102', '1000504'],
                //notebook: new Notebook({
                    //brand: 'dubovo'
                //})
            //})
        //]
    //})

    //await person.save()



    //let notik = await Savable.m.Notebook.findOne(ObjectID('5c7c064d2ed0f4c9ab4cba4e'))

    //let SilniyeMans = await Savable.m.Savable.find({ $or: [{surname: 'Silniy'}, {surname: 'Silnaya'}]})
    //for (let manPromise of SilniyeMans){
        //let man = await manPromise;

        //console.log('man', man.name, man.surname, man.createdAt)
        //notik.owner = man
        ////notik.owner = [man]
        ////notik.owner = new Set([man])
        //break;
    //}

    //await notik.save()



    //console.log(notik)
    //notik.ram = 4;
    //notik.resolution = {width: 1920, height: 1080}
    //await notik.save()
    //console.log(await Savable.m.Notebook.findOne(ObjectID('5c7c064d2ed0f4c9ab4cba4e')))

    //while(true){
        //await (new Savable({timestamp: (new Date).getTime(), r: Math.random()})).save()
        //console.log(person)

        //await delay(1000)
    ////}

    ////let person = new Savable()
    ////person._id = ObjectID('5c7bd603ce3cbc409978203e');
    ////console.log(person)

    //let child = new Savable({
        //name: 'New One Child',
        //surname: 'Silniy',
        //phones: ['105', '1000506']
    //});

    ////console.log(await person)
    ////console.log(await person.children[1])
    //person.children.push(child)
    //child.father = person

    ////console.log(person)
    ////console.log(child)

    //await person.save()


    ////console.log(await person.children[3])
    //let p2 =new Savable({_id: ObjectID('5c7bf8f04a3a3299f7deda0d' )}, true) //check for cache hit
    //;(await new Savable({_id: ObjectID('5c7bf8f04a3a3299f7deda0d' )}, true)) //check for cache hit
    //;(await p2)
    //console.log('parent 2', p2)
    //console.log(await     p2.children[3]) //check for other hit
    //console.log(await person.children[3].father)
    //console.log(await person.children[3].father.children[1])

    ////let obj = {
        ////then(cb){
            ////process.nextTick(() => cb(obj))
        ////}
    ////}
    ////console.log(await obj)
    ////console.log('empty await', await person)//.then(p => console.log(p))
    ////console.log('sub await', (await person.children[0]))//.then(p => console.log(p))



    client.close();
})()
