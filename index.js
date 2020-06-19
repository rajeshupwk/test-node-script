const axios = require('axios')

const CLIENT_ID = "r9VlPfHk0MEx7Mfw+izyei+E0ZUhfkghqGgv2Zeb+H4="
const CLIENT_SECRET = "ef7ac57cc66a42b5efd695e058d1fdd1AidDbU82jomHcISlVSOwBSAxQvG7KKwuEcWREBBISh0="

const getAuthToken = async () => {
  const data = {
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "scope": "b2b",
    "grant_type": "client_credentials"
  }

  const headers = {
    'Content-Type': 'application/json'
  }

  const res = await axios.post('https://stage.bookaway.com/api/auth/v1/oauth/token', data, { headers })
  return res.data.access_token
}

const getAuthHeader = async () => {
  const token = await getAuthToken()
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
  return { headers }
}

const getStations = async (city) => {
  const authData = await getAuthHeader()
  const res = await axios.get('https://stage.bookaway.com/api/b2b/v1/stations', authData)
  const stations = city ? res.data.filter((st) => st.city.city === city) : res.data
  return stations
}

const getStationsCount = async (city) => {
  const stations = await getStations(city)
  console.log(`Stations count from ${city}: ${stations.length}`)
  return stations.length
}

const formatDate = () => {
  let d = new Date(),
    month = '' + (d.getMonth() + 1),
    day = '' + (d.getDate()+2),
    year = d.getFullYear();

  if (month.length < 2) 
    month = '0' + month;
  if (day.length < 2) 
    day = '0' + day;

  return [year, month, day].join('-');
}

// departure date should be in "YYYY-MM-DD" format
const getTrips = async(from, to, departure, passengers) => {
  const authData = await getAuthHeader()

  let fromStationId, toStationId;

  const routes = await getRoutes(from, to)
  
  if (routes.length) {
    fromStationId = routes[0].from
    toStationId = routes[0].to
  } 
  else {
    const fromStations = await getStations(from)
    const toStations = await getStations(to)
    fromStationId = fromStations[0].stationId
    toStationId = toStations[0].stationId
  }

  const url = `https://stage.bookaway.com/api/b2b/v1/trips?departureStation=${fromStationId}&&arrivalStation=${toStationId}&&departure=${departure}&&passengers=${passengers}`
  const res = await axios.get(url, authData)
  console.log(`Trips from ${from} to ${to}: `, res.data.data)
  return res.data.data
}

const getRoutes = async (from, to) => {
  const authData = await getAuthHeader()
  const res = await axios.get('https://stage.bookaway.com/api/b2b/v1/routes', authData)
  const query = `${from} to ${to}`
  return (from && to) ? res.data.filter(route => route.name.includes(query)) : res.data
}

const printToken = async() => {
  console.log(`Token: ${await getAuthToken()}`)
}

const getCredits = async () => {
  const authData = await getAuthHeader()
  const res = await axios.get('https://stage.bookaway.com/api/b2b/v1/credits', authData)
  console.log('Remaining Credits: ',`${res.data.currency} ${res.data.balance}`)
  return res.data
}

const getTransfers = async (transferId) => {
  const authData = await getAuthHeader()
  const res = await axios.get('https://stage.bookaway.com/api/b2b/v1/transfers', authData)
  return transferId ? res.data.filter(t => t.id === transferId)[0] : res.data
}

const getDefaultValue = (label) => {
  switch (label) {
    case "Passport Number":
      return '0123456'
      break;
    case 'Nationality':
      return 'Vietnamese'
      break;
    case 'Gender':
      return 'Female'
      break;
    default:
      break;
  }
}

const getBookingData = async() => {
  let trips = await getTrips('Hanoi', 'Sapa', formatDate(), 2)
  if (!trips.length)
    return false
  trips = trips.sort((a,b) => a.price.totalAmount > b.price.totalAmount ? 1 : b.price.totalAmount > a.price.totalAmount ? -1 : 0)

  const instantConfirmTrips = trips.filter(t => t.isInstantConfirmation && isAvailable)
  if (instantConfirmTrips.length) {
    trips = instantConfirmTrips
  }

  const tripId = trips[0].id
  const transfer = await getTransfers(trips[0].transferId)
  const passengerExtraInfos = transfer.passengerExtraInfos.length ? transfer.passengerExtraInfos.map(pe => {
    return {
      definition: pe.id,
      value: getDefaultValue(pe.label)
    }
  }) : []
  const extraOptions = transfer.extras.length ? transfer.extras.filter(ex=>ex.mandatory).map(e => {
    return {
      definition: e.id,
      value: e.note
    }
  }) : []

  return {
    tripId,
    passengers: [
      {
        firstName: "John",
        lastName: "Doe",
        extraInfos: passengerExtraInfos
      }
    ],
    contact: {
      email: "johndoe@gmail.com",
      phone: "+1 (234) 456-6677"
    },
    extraOptions
  }
}

const bookTrip = async () => {
  const authData = await getAuthHeader()
  const data = await getBookingData()
  if (data){
    try {
      const res = await axios.post('https://stage.bookaway.com/api/b2b/v1/bookings', data, authData)
      console.log('==========================================')
      console.log('Booking Created: ',res.data)
      const bookingPay = await axios.post(`https://stage.bookaway.com/api/b2b/v1/bookings/${res.data.id}/pay`, {id: res.data.id}, authData)
      console.log('==========================================')
      console.log('Booking Pay: ',bookingPay.data)
      console.log('==========================================')
      getCredits()
      console.log('Started Checking for Approval: Wait For atleast two minutes')
      checkForApproval(res.data.id)
    }
    catch (e) {
      console.log('error', e)
    }
  }
  else {
    console.log(`Trips not available.`)
    return {}
  }
}

const checkForApproval = async (bookingId) => {
  const authData = await getAuthHeader()
  let keepCalling = true
  let approved = false
  setTimeout(() => {
    keepCalling = false;
  }, 60*2*1000);
  while (!approved && keepCalling) {
    const res = await axios.get(`https://stage.bookaway.com/api/b2b/v1/bookings/${bookingId}`, authData)
    if (res.data.status === 'approved'){
      approved = true
      console.log(`Booking #${bookingId}: Approved`)
    }
  }
}

printToken()
getCredits()
getStationsCount('Hanoi')
getStationsCount('Sapa')
bookTrip()