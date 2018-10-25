import { EmailService } from "./services/email-service";

const admin = require('firebase-admin');
const functions = require('firebase-functions');


const emailService: EmailService = new EmailService();

const express = require('express');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const app = express();
admin.initializeApp();
// Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
// The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
// `Authorization: Bearer <Firebase ID Token>`.
// when decoded successfully, the ID Token content will be added as `req.user`.
const validateFirebaseIdToken = (req, res, next) => {
    //console.log('Check if request is authorized with Firebase ID token');

    if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) &&
        !req.cookies.__session) {
        console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.',
            'Make sure you authorize your request by providing the following HTTP header:',
            'Authorization: Bearer <Firebase ID Token>',
            'or by passing a "__session" cookie.');
        res.status(403).send('Unauthorized');
        return;
    }

    let idToken;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        //console.log('Found "Authorization" header');
        // Read the ID Token from the Authorization header.
        idToken = req.headers.authorization.split('Bearer ')[1];
    } else {
      //  console.log('Found "__session" cookie');
        // Read the ID Token from cookie.
        idToken = req.cookies.__session;
    }
    admin.auth().verifyIdToken(idToken).then((decodedIdToken) => {
        //console.log('ID Token correctly decoded', decodedIdToken);
        req.user = decodedIdToken;
        return next();
    }).catch((error) => {
        console.error('Error while verifying Firebase ID token:', error);
        res.status(403).send('Unauthorized');
    });
};

app.use(cors);
app.use(cookieParser);
app.use(validateFirebaseIdToken);
/**
 * Rest End points
 */
app.post('/createUser', (req, res) => {
    admin.auth().createUser({
        email: req.body.email,
        emailVerified: false,
        password: req.body.password,
        displayName: req.body.firstName + ' ' + req.body.lastName,
        disabled:   false
      }).then((user)=>{
        res.send({user: user});
      }).catch((error)=>{
          res.send({error: error});
      })

});

app.post('/sendConfirmationMail', (req, res)=>{
    let body = req.body;
    emailService.sendConfirmationMail(body.displayName, body.password, body.email);
    res.send({});
})

app.post('/createUsers', (req, res) => {
    let userList = req.body.users;
    let client_id = req.body.clientId;
    let failedList = [];
    let successList = [];
    let counter = 0;
    let password =  generatePassword();
    for(let user of userList) {
        admin.auth().createUser({
            email: user.email,
            emailVerified: false,
            password: password,
            displayName: user.firstName + ' ' + user.lastName,
            disabled:   false
          }).then((userObj)=>{
                //add user to collection
                let userData = {
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    client_id: client_id,
                    creationDate: new Date(),
                    isActivated: true,
                    role: 'user',
                    uid: userObj.uid
                }
                admin.firestore().collection('users').add(userData).then((userRef) => {
                    console.log(userRef);
                    userRef.update({
                        _id: userRef.id
                    }).then(()=>{
                        successList.push({user: user, id:  userRef.id})
                        counter = counter + 1;
                        if(counter == userList.length) {
                            res.send({failedList: failedList, successList: successList})
                        }
                        emailService.sendConfirmationMail(userData.firstName + ' ' + userData.lastName, password, userData.email);
                    }).catch((error)=>{
                        console.log(error);
                        failedList.push({user: user, reason: error})
                        counter = counter + 1;
                        if(counter == userList.length) {
                            res.send({failedList: failedList, successList: successList})
                        }
                    })
                }).catch((error)=>{
                    console.log(error);
                    failedList.push({user: user, reason: error})
                    counter = counter + 1;
                    if(counter == userList.length) {
                        res.send({failedList: failedList, successList: successList})
                    }
                });
          }).catch((error)=>{
            console.log(error);
            failedList.push({user: user, reason: error})
            counter = counter + 1;
            if(counter == userList.length) {
                res.send({failedList: failedList, successList: successList})
            }
          })
    }

});


app.post('/deActivate', (req, res) => {
    admin.auth().updateUser(req.body.uid, {
        disabled: true
    }).then(()=>{
        res.send({'status': 'success'})
    }).catch((error)=>{
        console.log(error);
        res.send({'status': 'failed', error: error})
    })
});

app.post('/deleteUser', (req, res) => {
    let id = req.body.id;
    console.log(id);
    admin.firestore().collection('users').doc(id).get().then((item) => {
        console.log(item);
        let uid = item.data().uid;
        admin.firestore().collection('users').doc(id).delete().then(() => {
            admin.auth().deleteUser(uid).then(()=>{
                res.send({'status': 'success'})
            }).catch((error)=>{
                console.log(error);
                res.send({'status': 'failed', error: error})
            })
        }).catch((error) => {
            console.log(error);
            res.send({'status': 'failed', error: error})
        })
    })
    
    
});

app.post('/deleteClientsers', (req, res) => {
    let client_id = req.body.client_id;
    admin.firestore().collection('users').where("client_id", "==", client_id).get().then((items) => {
        var list = [];
        let count = 0;
        items.forEach(function (doc) {
            let id = doc.id;
            admin.firestore().collection('users').doc(id).get().then((item) => {
                console.log(item);
                let uid = item.data().uid;
                admin.firestore().collection('users').doc(id).delete().then(() => {
                    admin.auth().deleteUser(uid).then(()=>{
                        count = count + 1;
                        if(count == items.size) {
                            res.send({'status': 'success'})
                        }
                        
                    }).catch((error)=>{
                        count = count + 1;
                        if(count == items.size) {
                            res.send({'status': 'failed', error: error})
                        }
                        
                    })
                }).catch((error) => {
                    console.log(error);
                    res.send({'status': 'failed', error: error})
                })
            })
        });
    })
    
    
    
    
});


function generatePassword() {
    let chars = "0123456789";
    let randomstring = '';
    for (let i = 0; i < 6; i++) {
        let rnum = Math.floor(Math.random() * chars.length);
        randomstring += chars.substring(rnum, rnum + 1);
    }
    return randomstring;
}
export const skillbridge = functions.https.onRequest(app);
