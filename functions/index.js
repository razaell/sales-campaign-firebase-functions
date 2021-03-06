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

exports.getRegionListData = functions.https.onCall((data, context) => {
  // Realtime database return must be from resolve promise due to heap stack
  return new Promise((resolve, reject) => {
    admin.database().ref('region').on('value', (snapshot) => {
      const channelList = {}

      snapshot.forEach((childSnapshot) => {
        const key = childSnapshot.key
        const data = []
        for (const [key, value] of Object.entries(childSnapshot.val())) {
          data.push({ value: key, label: value.channel_name })
        }
        // channelList[key] = [...data]
        channelList[key] = [...data]
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
  let productPhoneNumber = ''
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
      const salesPhoneNumber = salesDataValue.phone_number

      productUID = await getProductUID(salesRegion, salesChannel, inputData.conversation_type)
      productPhoneNumber = await getProductPhoneNumber(productUID)

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
        product_uid: productUID,
        sales_phone_number: salesPhoneNumber,
        product_handler_phone_number: productPhoneNumber
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

const getProductPhoneNumber = (uid) => {
  // Realtime database return must be from resolve promise due to heap stack
  return new Promise((resolve, reject) => {
    return admin.firestore().collection('user_data').doc(uid).get()
      .then(documentSnapshot => {
        // console.log(documentSnapshot.data())
        resolve(documentSnapshot.data().phone_number)
      })
      .catch((error) => { reject(error) })
  })
}

exports.getSalesSchedule = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  return admin.firestore().doc(`user_data/${uid}`).collection('schedule').where('verified', '==', 'verified').where('executed', '==', 'waiting').orderBy('end_time').startAt(new Date(Date.now())).get()
    .then(querySnapshot => {
      const salesSchedule = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        salesSchedule.push({
          company_name: data.company_name,
          product_handler: data.product_handler,
          sales_region: data.sales_region,
          sales_channel: data.sales_channel,
          product_handler_phone_number: data.product_handler_phone_number,
          conversation_type: data.conversation_type,
          product_category: data.product_category,
          _id: data._id,
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

exports.getRequestedForm = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  return admin.firestore().doc(`user_data/${uid}`).collection('schedule').where('verified', '==', 'waiting').orderBy('end_time').startAt(new Date(Date.now())).get()
    .then(querySnapshot => {
      const salesSchedule = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        salesSchedule.push({
          company_name: data.company_name,
          product_handler: data.product_handler,
          sales_region: data.sales_region,
          sales_channel: data.sales_channel,
          product_handler_phone_number: data.product_handler_phone_number,
          conversation_type: data.conversation_type,
          product_category: data.product_category,
          _id: data._id,
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

exports.getSalesHistory = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  const startDateFilter = new Date(data.start_date_filter)
  const endDateFilter = new Date(data.end_date_filter)

  return admin.firestore().doc(`user_data/${uid}`).collection('schedule').orderBy('start_time').startAt(startDateFilter).endAt(endDateFilter).get()
    .then(querySnapshot => {
      const salesSchedule = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        salesSchedule.push({

          company_name: data.company_name,
          conversation_type: data.conversation_type,
          _id: data._id,
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          verified: data.verified,
          executed: data.executed,
          postpone_status: data.postpone_status

          // sales_name: data.sales_name,
          // customer_name: data.customer_name,
          // customer_email: data.customer_email,
          // customer_phone_number: data.customer_phone_number,
          // conversation_type: data.conversation_type,
          // _id: data._id,
          // // time convert to string due to unknown on frontend
          // start_time: data.start_time.toDate().toISOString(),
          // end_time: data.end_time.toDate().toISOString(),
          // verified: data.verified,
          // executed: data.executed,
          // postpone_status: data.postpone_status
        })
      })
      return salesSchedule
    }).catch(error => {
      console.log(error)
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

exports.getCanceledForm = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  return admin.firestore().doc(`user_data/${uid}`).collection('schedule').where('verified', '==', 'canceled').orderBy('start_time').get()
    .then(querySnapshot => {
      const canceledSchedule = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        canceledSchedule.push({
          company_name: data.company_name,
          product_handler: data.product_handler,
          sales_region: data.sales_region,
          sales_channel: data.sales_channel,
          product_handler_phone_number: data.product_handler_phone_number,
          conversation_type: data.conversation_type,
          product_category: data.product_category,
          _id: data._id,
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          verified: data.verified,
          executed: data.executed,
          postpone_status: data.postpone_status
        })
      })
      return canceledSchedule
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
          sales_region: data.sales_region,
          sales_channel: data.sales_channel,
          sales_phone_number: data.sales_phone_number,
          conversation_type: data.conversation_type,
          product_category: data.product_category,
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

// Product schedule
exports.getProductSchedule = functions.https.onCall((data, context) => {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError('failed-precondition', 'The function must be called ' +
        'while authenticated.')
  }
  const uid = context.auth.uid

  return admin.firestore().collectionGroup('schedule')
    .where('product_uid', '==', uid).where('verified', '==', 'verified').where('executed', '==', 'waiting').orderBy('end_time').startAt(new Date(Date.now())).get()
    .then(querySnapshot => {
      const executedData = []

      querySnapshot.forEach(documentSnapshot => {
        const data = documentSnapshot.data()
        executedData.push({
          company_name: data.company_name,
          sales_name: data.sales_name,
          sales_region: data.sales_region,
          sales_channel: data.sales_channel,
          sales_phone_number: data.sales_phone_number,
          conversation_type: data.conversation_type,
          product_category: data.product_category,
          _id: data._id,
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          verified: data.verified,
          executed: data.executed,
          postpone_status: data.postpone_status
        })
      })
      // console.log(executedData)
      return executedData
    }).catch(err => {
      console.log(err)
      throw new functions.https.HttpsError('invalid-argument', 'the function error')
    })
})

// Execution form
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
          sales_region: data.sales_region,
          sales_channel: data.sales_channel,
          sales_phone_number: data.sales_phone_number,
          conversation_type: data.conversation_type,
          product_category: data.product_category,
          _id: data._id,
          start_time: data.start_time.toDate().toISOString(),
          end_time: data.end_time.toDate().toISOString(),
          verified: data.verified,
          executed: data.executed,
          postpone_status: data.postpone_status
        })
      })
      // console.log(executedData)
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
  // console.log(context)

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
          message: 'No Point Because Reschedule',
          notification: 'on'
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
        message: `You get ${point} Point`,
        notification: 'on'
      }
    }
  } else if (verification === 'executed') {
    messageData = {
      data: {
        titlemessage: 'Your arrangement has finished!',
        message: `You get ${point} Point`,
        notification: 'on'
      }
    }
  } else if (verification === 'canceled') {
    messageData = {
      data: {
        titlemessage: 'Your Request is Canceled!',
        message: 'Please Arrange another Schedule',
        notification: 'on'
      }
    }
  } else if (verification === 'new') {
    messageData = {
      data: {
        titlemessage: 'New Form',
        message: 'New Concall/Visit has been arranged by a Sales!',
        notification: 'on'
      }
    }
  } else if (verification === 'postpone') {
    messageData = {
      data: {
        titlemessage: 'Visit/Concall has been postponed',
        message: 'Please re-arrange Schedule',
        notification: 'on'
      }
    }
  }
  return messageData
}

const FCMHandler = async (userUID, message) => {
  console.log('sending Message')
  admin.firestore().collection('user_data').doc(userUID).get().then((documentSnapshot) => {
    const deviceToken = [...documentSnapshot.data().device_token]
    if (deviceToken.length === 0) {
      return null
    } else {
      return new Promise((resolve, reject) => {
        admin.messaging().sendToDevice(
          deviceToken,
          // ['cHn-gb_kQRWwYsDGYNZ3Iz:APA91bFiwmToaTjBcCpS8iKp2rCQM7ZWOgcRwwTBLcS4WTp20SnlZXunnS2AIvQH7xFhcHj325k8MiYFxAI-74Ay8b8qR1t1nMmIeja7QA7MpvBWcANweuRTgIxQ0PVfLGYvMUhnpV37'],
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
    }
  })
}
