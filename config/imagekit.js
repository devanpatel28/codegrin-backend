const ImageKit = require("imagekit");

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});


const ImagekitFolder = {
    driver_documents: '/echarter/driver-documents/',
    vehicle_documents: '/echarter/vehicle-documents/',
    trip_documents: '/echarter/trip-documents/',
    driver_profile: '/echarter/driver-profile/',
    vehicle_images: '/echarter/vehicle-images/'
}
module.exports = {imagekit,ImagekitFolder};
