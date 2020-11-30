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

// SignUp Page Function

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

// Sales Form Function

exports.addNewForm = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }

  const uid = context.auth.uid
  const inputData = data.input_data

  // ISO Date Submit time (Server)
  const submitTime = new Date(Date.now())

  return admin.firestore().collection('user_data').doc(uid).get()
    .then(salesDataCollection => {
      const salesDataValue = salesDataCollection.data()
      // get val 1 by 1
      const salesName = salesDataValue.name
      const salesNIP = salesDataValue.nip
      const salesRegion = salesDataValue.region
      const salesChannel = salesDataValue.channel

      const generateId = `${submitTime.getTime()}${salesNIP}`

      const bookingForm = {
        ...inputData,
        _id: generateId,
        start_time: new Date(inputData.start_time),
        end_time: new Date(inputData.end_time),
        created_at: submitTime,
        verified: 'waiting',
        executed: 'waiting',
        sales_name: salesName,
        sales_region: salesRegion,
        sales_channel: salesChannel
      }
      return admin.firestore().collection('user_data').doc(`${uid}/schedule/${generateId}`).set(bookingForm)
    })
    .then(() => {
      return testMessage(messageList('new'))
    }).then(() => {
      return 'Add Form Success'
    })
    .catch(error => {
      console.log('Error getting documents', error)
      // Throwing an HttpsError so that the client gets the error details.
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

exports.getSalesFormRequest = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  return admin.firestore().doc(`user_data/${uid}`).collection('schedule').orderBy('start_time').get()
    .then(querySnapshot => {
      const salesSchedule = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        salesSchedule.push({
          sales_name: data.sales_name,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          customer_handphone: data.customer_handphone,
          conversation_type: data.conversation_type,
          _id: data._id,
          // time convert to string due to unknown on frontend
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          verified: data.verified,
          executed: data.executed
        })
      })
      return salesSchedule
    }).catch(error => {
      console.log(error)
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

exports.getFormDetail = functions.https.onCall((data, context) => {
  const formId = data.formId

  return admin.firestore().collectionGroup('schedule').where('_id', '==', formId).get()
    .then(querySnapshot => {
      let formDetailResponse = []
      if (querySnapshot.size > 1) {
        throw new functions.https.HttpsError('invalid-argument', 'multiple Form is Found')
      } else {
        querySnapshot.forEach(documentSnapshot => {
          formDetailResponse = {
            ...documentSnapshot.data(),
            start_time: documentSnapshot.data().start_time.toDate().toISOString(),
            end_time: documentSnapshot.data().end_time.toDate().toISOString()
          }
        })
        return formDetailResponse
      }
    }).catch((error) => {
      console.log(error)
      throw new functions.https.HttpsError('invalid-argument', 'Failed to receive Data')
    })
})

// on progress

exports.getWaitingForm = functions.https.onCall((data, context) => {
  const uid = context.auth.uid

  return admin.firestore().collection('user_data').doc(uid).get()
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
          company_name: data.company_name,
          sales_name: data.sales_name,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          customer_handphone: data.customer_handphone,
          _id: data._id,
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          verified: data.verified,
          executed: data.executed
        })
      })

      return confirmationData
    }).catch(err => {
      console.log(err)
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

// exports.getWaitingForm = functions.https.onRequest((request, response) => {
//   const body = request.body

//   const uid = body.data.useruid

//   admin.firestore().collection('user-data').doc(uid).get()
//     .then(documentSnapshot => {
//       // (documentSnapshot.data().name)
//       const productname = documentSnapshot.data().name

//       return admin.firestore().collectionGroup('schedule')
//         .where('producthandler', '==', productname).where('isverified', '==', 'waiting').orderBy('start').get()
//     })
//     .then(querySnapshot => {
//       const confirmationData = []

//       querySnapshot.forEach(documentSnapshot => {
//         const data = documentSnapshot.data()
//         confirmationData.push({
//           salesname: data.salesname,
//           customername: data.customername,
//           customeremail: data.customeremail,
//           customerhandphone: data.customerhandphone,
//           id: data.id,
//           start: data.start.toDate(),
//           end: data.end.toDate()
//         })
//       })

//       response.send({
//         response: { code: 200, message: 'berhasil' }, data: confirmationData
//       })
//     }).catch(err => {
//       console.log(err)
//       response.status(500).send(err)
//     })
// })

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
