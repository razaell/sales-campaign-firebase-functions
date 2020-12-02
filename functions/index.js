const functions = require('firebase-functions')

// // The Firebase Admin SDK to access Cloud Firestore.
// const admin = require('firebase-admin')
// // const { firestore } = require('firebase-admin')
// admin.initializeApp()

var admin = require('firebase-admin')

// var serviceAccount = require('../salescampaignkl-firebase-adminsdk-6khq9-755a60ab0e.json')
var serviceAccount = require('./service_key.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://salescampaignkl.firebaseio.com'
})

// SignUp Page Function
exports.onUserCreated = functions.auth.user().onCreate((user) => {
  const userUID = user.uid

  return admin.auth().setCustomUserClaims(userUID, { level: 'sales' }).then(() => {
    return 'success'
  }).catch(() => {
    return 'error'
  })
})

// exports.checkAuth = functions.https.onCall((data, context) => {
//   return getProductUID('R2', 'kls_branch_bandung', 'visit')
// })

exports.getChannelList = functions.https.onCall((data, context) => {
  const region = data.region

  // Realtime database return must be from resolve promise due to heap stack
  return new Promise((resolve, reject) => {
    admin.database().ref(`region/${region}`).on('value', (snapshot) => {
      const channelList = []
      snapshot.forEach((childSnapshot) => {
        channelList.push({
          value: childSnapshot.key,
          label: childSnapshot.val().channel_name
        })
      })
      // return List of Channel
      return resolve(channelList)
    }, (errorObject) => {
      throw new functions.https.HttpsError('invalid-argument', 'The function failed to be processed')
    })
  })
})

exports.getAvailableProductHandler = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }

  const uid = context.auth.uid
  return admin.firestore().collection('user_data').doc(uid).get()
    .then(val => {
      const region = val.data().region
      const channel = val.data().channel
      return new Promise((resolve, reject) => {
        admin.database().ref(`region/${region}/${channel}`).on('value', (snapshot) => {
          const value = snapshot.val()
          const availableConType = []
          if (value.conference_call.product_uid !== '') {
            availableConType.push({
              conversation_type: 'Conference Call',
              product_handler: value.conference_call.product_name
            })
          }
          if (value.visit.product_uid !== '') {
            availableConType.push({
              conversation_type: 'Visit',
              product_handler: value.visit.product_name
            })
          }
          return resolve(availableConType)
        }, function (errorObject) {
          throw new functions.https.HttpsError('invalid-argument', 'The function failed to be processed')
        })
      })
    }).catch(() => {
      throw new functions.https.HttpsError('invalid-argument', 'The function failed to be processed')
    })
})

exports.addNewForm = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }

  const uid = context.auth.uid
  const inputData = data.input_data
  let productUID = ''
  // ISO Date Submit time (Server)
  const submitTime = new Date(Date.now())

  return admin.firestore().collection('user_data').doc(uid).get()
    .then(async salesDataCollection => {
      const salesDataValue = salesDataCollection.data()
      // get val 1 by 1
      const salesName = salesDataValue.name
      const salesNIP = salesDataValue.nip
      const salesRegion = salesDataValue.region
      const salesChannel = salesDataValue.channel

      productUID = await getProductUID(salesRegion, salesChannel, inputData.conversation_type)

      const generateId = `${submitTime.getTime()}${salesNIP}`
      const bookingForm = {
        ...inputData,
        _id: generateId,
        start_time: new Date(inputData.start_time),
        end_time: new Date(inputData.end_time),
        created_at: submitTime,
        verified: 'waiting',
        executed: 'waiting',
        postpone_status: false,
        sales_name: salesName,
        sales_region: salesRegion,
        sales_channel: salesChannel,
        product_uid: productUID
      }
      return admin.firestore().collection('user_data').doc(`${uid}/schedule/${generateId}`).set(bookingForm)
    })
    .then(() => {
      return FCMHandler(productUID, getMessageData('new'))
    }).then(() => {
      return 'Add Form Success'
    })
    .catch(error => {
      console.log('Error getting documents', error)
      // Throwing an HttpsError so that the client gets the error details.
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

const getProductUID = (region, channel, conversationType) => {
  // Realtime database return must be from resolve promise due to heap stack
  let conType = ''
  if (conversationType === 'Visit') {
    conType = 'visit'
  } else if (conversationType === 'Conference Call') {
    conType = 'conference_call'
  }

  return new Promise((resolve, reject) => {
    admin.database().ref(`region/${region}/${channel}/${conType}`).once('value', (snapshot) => {
      const productUID = snapshot.val().product_uid
      return resolve(productUID)
    }, (errorObject) => {
      throw new functions.https.HttpsError('invalid-argument', 'The function failed to be processed')
    })
  })
}

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
          executed: data.executed,
          postpone_status: data.postpone_status
        })
      })
      return salesSchedule
    }).catch(error => {
      console.log(error)
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

exports.getFormDetail = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
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
        delete formDetailResponse.product_uid
        return formDetailResponse
      }
    }).catch((error) => {
      console.log(error)
      throw new functions.https.HttpsError('invalid-argument', 'Failed to receive Data')
    })
})

// Product Form Backend Function

exports.getWaitingForm = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  return admin.firestore().collectionGroup('schedule')
    .where('product_uid', '==', uid).where('verified', '==', 'waiting').orderBy('start_time').get()
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
          executed: data.executed,
          postpone_status: data.postpone_status
        })
      })

      return confirmationData
    }).catch(err => {
      console.log(err)
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

exports.getProgressPage = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  return admin.firestore().collectionGroup('schedule')
    .where('product_uid', '==', uid).where('verified', '==', 'verified').where('executed', '==', 'waiting').orderBy('start_time').get()
    .then(querySnapshot => {
      const executedData = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        executedData.push({
          company_name: data.company_name,
          sales_name: data.sales_name,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          customer_handphone: data.customer_handphone,
          _id: data._id,
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          verified: data.verified,
          executed: data.executed,
          postpone_status: data.postpone_status
        })
      })
      console.log(executedData)
      return executedData
    }).catch(err => {
      console.log(err)
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

// Firebase firestore Function

exports.changeOnForm = functions.firestore.document('user_data/{userId}/schedule/{formId}').onUpdate((change, context) => {
  const oldVal = change.before.data()
  const newVal = change.after.data()

  // const test = change.after.ref.path // path declaration
  const useruid = context.params.userId
  console.log(context)

  if (oldVal.verified === 'waiting' && newVal.verified === 'verified') {
    let point
    if (!newVal.postpone_status) {
      if (newVal.conversation_type === 'Visit') {
        admin.firestore().collection('user_data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(10) })
        point = 10
      } else if (newVal.conversation_type === 'Conference Call') {
        admin.firestore().collection('user_data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(5) })
        point = 5
      }
      return FCMHandler(useruid, getMessageData('accepted', point))
    } else {
      return FCMHandler(useruid, {
        data: {
          titlemessage: 'Your Request is Accepted!',
          message: 'No Point Because Reschedule'
        }
      })
    }
  } else if (oldVal.executed === 'waiting' && newVal.executed === 'done') {
    let point
    if (newVal.conversation_type === 'Visit') {
      admin.firestore().collection('user_data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(10) })
      point = 10
    } else if (newVal.conversation_type === 'Conference Call') {
      admin.firestore().collection('user_data').doc(`${useruid}`).update({ point: admin.firestore.FieldValue.increment(5) })
      point = 5
    }
    return FCMHandler(useruid, getMessageData('executed', point))
  } else if (oldVal.verified === 'waiting' && newVal.verified === 'canceled') {
    return FCMHandler(useruid, getMessageData('canceled'))
  } else if (oldVal.verified === 'verified' && newVal.verified === 'canceled') {
    return FCMHandler(useruid, getMessageData('postpone'))
  }
  return null
})

function getMessageData (verification, point = 0) {
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

const FCMHandler = async (userUID, message) => {
  admin.firestore().collection('user_data').doc(userUID).get().then((documentSnapshot) => {
    const deviceToken = documentSnapshot.data().device_token

    return new Promise((resolve, reject) => {
      admin.messaging().sendToDevice(
        deviceToken,
        {
          ...message
        },
        {
          // Required for background/quit data-only messages on Android
          priority: 'high'
        }
      ).then(result => {
        // console.log('successfully send message', result)
        resolve(result)
      }
      ).catch(error => {
        console.log('error happened')
        reject(error)
      })
    })
  })
}
