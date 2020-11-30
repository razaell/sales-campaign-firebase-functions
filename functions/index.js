const functions = require('firebase-functions')

// // The Firebase Admin SDK to access Cloud Firestore.
// const admin = require('firebase-admin')
// // const { firestore } = require('firebase-admin')
// admin.initializeApp()

var admin = require('firebase-admin')

var serviceAccount = require('../salescampaignkl-firebase-adminsdk-6khq9-755a60ab0e.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://salescampaignkl.firebaseio.com'
})

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

/* exports.testChannelList = functions.https.onCall((data, context) => {
  const region = data.region
  return admin.database().ref(`region/${region}`).on('value', function (snapshot) {
    const channelList = []
    snapshot.forEach(function (childSnapshot) {
      channelList.push({
        value: childSnapshot.key,
        label: childSnapshot.val().name
      })
    })
    return { response: { code: 200, message: 'berhasil' }, data: channelList }
  }, function (errorObject) {
    console.log('The read failed: ' + errorObject.code)
    throw new functions.https.HttpsError('invalid-argument', 'The function must be called with ' +
    'one arguments "text" containing the message text to add.')
  })
}) */

exports.getChannelList = functions.https.onRequest((request, response) => {
  const body = request.body
  const region = body.data.region
  // const region = body.region

  admin.database().ref(`region/${region}`).on('value', function (snapshot) {
    const channelList = []
    snapshot.forEach(function (childSnapshot) {
      channelList.push({
        value: childSnapshot.key,
        label: childSnapshot.val().name
      })
    })
    response.send({
      response: { code: 200, message: 'berhasil' }, data: channelList
    })
  }, function (errorObject) {
    console.log('The read failed: ' + errorObject.code)
    response.status(500).send(errorObject)
  })
})

exports.addNewForm = functions.https.onRequest((request, response) => {
  const body = request.body

  const uid = body.data.useruid
  const inputdata = body.data.inputdata
  const submitTime = new Date(Date.now())

  admin.firestore().collection('user-data').doc(uid).get()
    .then(val => {
      const salesname = val.data().name
      const salesid = val.data().id
      const salesregion = val.data().region
      const saleschannel = val.data().channel

      const generateId = `${submitTime.toISOString()}${salesid}`

      const bookingForm = {
        ...inputdata,
        id: generateId,
        start: new Date(inputdata.start),
        end: new Date(inputdata.end),
        createddate: submitTime,
        isverified: 'waiting',
        isexecuted: 'waiting',
        salesname,
        salesid,
        salesregion,
        saleschannel
      }

      // console.log(bookingForm);
      return admin.firestore().collection('user-data').doc(`${uid}/schedule/${submitTime.toISOString()}${salesid}`).set(bookingForm)
    })
    .then(() => {
      return testMessage(messageList('new'))
    }).then(() => {
      response.send({
        response: { code: 200, message: 'berhasil' }, data: 'success'
      })
    })
    .catch(err => {
      console.log('Error getting documents', err)
      response.status(500).send(err)
    })
})

exports.getWaitingForm = functions.https.onRequest((request, response) => {
  const body = request.body

  const uid = body.data.useruid

  admin.firestore().collection('user-data').doc(uid).get()
    .then(documentSnapshot => {
      // (documentSnapshot.data().name)
      const productname = documentSnapshot.data().name

      return admin.firestore().collectionGroup('schedule')
        .where('producthandler', '==', productname).where('isverified', '==', 'waiting').orderBy('start').get()
    })
    .then(querySnapshot => {
      const confirmationData = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        confirmationData.push({
          salesname: data.salesname,
          customername: data.customername,
          customeremail: data.customeremail,
          customerhandphone: data.customerhandphone,
          id: data.id,
          start: data.start.toDate(),
          end: data.end.toDate()
        })
      })

      response.send({
        response: { code: 200, message: 'berhasil' }, data: confirmationData
      })
    }).catch(err => {
      console.log(err)
      response.status(500).send(err)
    })
})

exports.getFormDetail = functions.https.onRequest((request, response) => {
  const body = request.body

  const formId = body.data.formId
  admin.firestore().collectionGroup('schedule').where('id', '==', formId).get()
    .then(querySnapshot => {
      // querySnapshot.forEach(documentSnapshot => {
      //   console.log(documentSnapshot.data())
      // })
      let data = []
      if (querySnapshot.size > 1) {
        // console.log('snapshot too much')
        response.status(500).send('kelebihan')
      } else {
        querySnapshot.forEach(documentSnapshot => {
          // console.log(documentSnapshot.data())
          data = {
            ...documentSnapshot.data(),
            start: documentSnapshot.data().start.toDate(),
            end: documentSnapshot.data().end.toDate()
          }
        })
        response.send({
          response: { code: 200, message: 'berhasil' }, data
        })
      }
    }).catch((err) => {
      console.log(err)
      response.status(500).send(err)
    }
    )
})

exports.getSalesFormRequest = functions.https.onRequest((request, response) => {
  const body = request.body

  const uid = body.data.useruid

  admin.firestore().doc(`user-data/${uid}`).collection('schedule').orderBy('start').get()
    .then(querySnapshot => {
      const salesSchedule = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        salesSchedule.push({
          salesname: data.salesname,
          customername: data.customername,
          customeremail: data.customeremail,
          customerhandphone: data.customerhandphone,
          conversationtype: data.conversationtype,
          id: data.id,
          start: data.start.toDate(),
          end: data.end.toDate(),
          isverified: data.isverified
        })
      })
      response.send({
        response: { code: 200, message: 'berhasil' }, data: salesSchedule
      })
    }).catch(err => {
      console.log(err)
      response.status(500).send(err)
    })
})

exports.getProgressPage = functions.https.onRequest((request, response) => {
  const body = request.body

  const uid = body.data.useruid

  admin.firestore().collection('user-data').doc(uid).get()
    .then(documentSnapshot => {
      // (documentSnapshot.data().name)
      const productname = documentSnapshot.data().name

      return admin.firestore().collectionGroup('schedule')
        .where('producthandler', '==', productname).where('isverified', '==', 'accepted').where('isexecuted', '==', 'waiting').orderBy('start').get()
    })
    .then(querySnapshot => {
      const confirmationData = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        confirmationData.push({
          salesname: data.salesname,
          customername: data.customername,
          customeremail: data.customeremail,
          customerhandphone: data.customerhandphone,
          id: data.id,
          start: data.start.toDate(),
          end: data.end.toDate(),
          isexecuted: data.isexecuted
        })
      })

      response.send({
        response: { code: 200, message: 'berhasil' }, data: confirmationData
      })
    }).catch(err => {
      console.log(err)
      response.status(500).send(err)
    })
})

exports.getAvailableProductHandler = functions.https.onRequest((request, response) => {
  const body = request.body

  const uid = body.data.useruid

  admin.firestore().collection('user-data').doc(uid).get()
    .then(val => {
      const region = val.data().region
      const channel = val.data().channel

      admin.database().ref(`region/${region}/${channel}`).on('value', function (snapshot) {
        console.log(snapshot.val())
        const value = snapshot.val()
        const contype = []

        if (value.concall !== '') {
          contype.push({
            conversationtype: 'Conference Call',
            producthandler: value.concall
          })
        }
        if (value.visit !== '') {
          contype.push({
            conversationtype: 'Visit',
            producthandler: value.visit
          })
        }
        console.log(contype)
        response.send({
          response: { code: 200, message: 'berhasil' }, data: contype
        })
      }, function (errorObject) {
        console.log('The read failed: ' + errorObject.code)
        response.status(500).send(errorObject)
      })
    }).catch(error => {
      console.log(error)
      response.status(500).send(error)
    })
})

exports.test = functions.https.onCall(async (data, context) => {
  const region = data.region
  console.log(context.auth.uid)
  console.log(context)

  return new Promise((resolve, reject) => {
    admin.database().ref(`region/${region}`).once('value', (snapshot) => {
    // return ref.once('value', function (snapshot) {
      const channelList = []
      snapshot.forEach(function (childSnapshot) {
        channelList.push({
          value: childSnapshot.key,
          label: childSnapshot.val().name
        })
      })
      return resolve({
        response: { code: 200, message: 'berhasil' }, data: channelList
      })
    }, function (errorObject) {
      reject(errorObject)
      console.log('The read failed: ' + errorObject.code)
      throw new functions.https.HttpsError('invalid-argument', 'The function must be called with ' +
    'one arguments "text" containing the message text to add.')
    })
  })
})

// Firebase firestore Function

exports.changeOnForm = functions.firestore.document('user-data/{userId}/schedule/{formId}').onUpdate((change, context) => {
  const oldVal = change.before.data()
  const newVal = change.after.data()

  // const test = change.after.ref.path // path declaration
  const useruid = context.params.userId

  if (oldVal.isverified === 'waiting' && newVal.isverified === 'accepted') {
    let point
    if (newVal.isexecuted !== 'postpone') {
      if (newVal.conversationtype === 'Visit') {
        admin.firestore().collection('user-data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(10) })
        point = 10
      } else if (newVal.conversationtype === 'Conference Call') {
        admin.firestore().collection('user-data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(5) })
        point = 5
      }
      return testMessage(messageList('accepted', point))
    } else {
      return testMessage({
        data: {
          titlemessage: 'Your Request is Accepted!',
          message: 'No Point Because Reschedule'
        }
      })
    }
  } else if ((oldVal.isexecuted === 'waiting' || oldVal.isexecuted === 'postponed') && newVal.isexecuted === 'done') {
    let point
    if (newVal.conversationtype === 'Visit') {
      admin.firestore().collection('user-data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(10) })
      point = 10
    } else if (newVal.conversationtype === 'Conference Call') {
      admin.firestore().collection('user-data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(5) })
      point = 5
    }
    return testMessage(messageList('executed', point))
  } else if (oldVal.isverified === 'waiting' && newVal.isverified === 'canceled') {
    return testMessage(messageList('canceled'))
  } else if (oldVal.isverified === 'accepted' && newVal.isverified === 'canceled') {
    return testMessage(messageList('canceled'))
  }
  return null
})

function messageList (verification, point) {
  let messageData = {}
  if (verification === 'accepted') {
    messageData = {
      data: {
        titlemessage: 'Your Request is Accepted!',
        message: `You get ${point} Point`
      }
    }
  } else if (verification === 'executed') {
    messageData = {
      data: {
        titlemessage: 'Your arrangement has finished!',
        message: `You get ${point} Point`
      }
    }
  } else if (verification === 'canceled') {
    messageData = {
      data: {
        titlemessage: 'Your Request is Canceled!',
        message: 'Please Arrange another Schedule'
      }
    }
  } else if (verification === 'new') {
    messageData = {
      data: {
        titlemessage: 'New Form',
        message: 'New Concall/Visit has been arranged by a Sales!'
      }
    }
  } else if (verification === 'postpone') {
    messageData = {
      data: {
        titlemessage: 'Visit/Concall has been postponed',
        message: 'Please re-arrange Schedule'
      }
    }
  }
  return messageData
}

async function testMessage (message) {
  return new Promise((resolve, reject) => {
    admin.messaging().sendToDevice(
      ['cHn-gb_kQRWwYsDGYNZ3Iz:APA91bFiwmToaTjBcCpS8iKp2rCQM7ZWOgcRwwTBLcS4WTp20SnlZXunnS2AIvQH7xFhcHj325k8MiYFxAI-74Ay8b8qR1t1nMmIeja7QA7MpvBWcANweuRTgIxQ0PVfLGYvMUhnpV37'], // device fcm tokens...
      {
        ...message
      },
      {
        // Required for background/quit data-only messages on Android
        priority: 'high'
      }
    ).then(result => {
      console.log('successfully send message', result)
      resolve(result)
    }
    ).catch(error => {
      console.log('error happened')
      reject(error)
    })
  })
}
