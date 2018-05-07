import * as converter from "./core/converter"
import { resize, loadImageElement } from "./core/image"
import Photo from "./core/Photo"

class Compress {
  constructor(options = {}) {
    this.setOptions(options)
  }

  setOptions(options) {
    const defaultOptions = {
      targetSize: Infinity, // the max size in MB
      quality: 0.75, // the quality of the image, max is 1
      minQuality: 0.5,
      qualityStepSize: 0.1,
      maxWidth: 1920,
      maxHeight: 1920,
      resize: true,
      throwIfSizeNotReached: false
    }

    const handler = {
      get: (obj, prop) => (prop in obj ? obj[prop] : defaultOptions[prop])
    }

    const p = new Proxy(options, handler)

    this.options = p
  }

  async _compressFile(file) {
    // Create a new photo object
    const photo = new Photo(file)

    // Create the conversion info object
    const conversion = {}
    conversion.start = window.performance.now()
    conversion.quality = this.options.quality
    conversion.startType = photo.type

    // Load the file into the photo object
    await photo.load()

    return await this._compressImage(photo, conversion)
  }

  async _compressImage(photo, conversion) {
    // Store the initial dimensions
    conversion.startWidth = photo.width
    conversion.startHeight = photo.height

    // Resize the image
    let newWidth, newHeight

    if (this.options.resize) {
      const resizedDims = resize(
        photo.width,
        photo.height,
        this.options.maxWidth,
        this.options.maxHeight
      )
      newWidth = resizedDims.width
      newHeight = resizedDims.height
    } else {
      newWidth = photo.width
      newHeight = photo.height
    }

    conversion.endWidth = newWidth
    conversion.endHeight = newHeight

    // Create a canvas element and resize the image onto the canvas
    const canvas = photo.getCanvas(newWidth, newHeight)

    // Initialise some variables for recursive call
    conversion.iterations = 0
    conversion.startSizeMB = converter.size(photo.size).MB

    await this._loopCompression(canvas, photo, conversion)

    conversion.endSizeMB = converter.size(photo.size).MB
    conversion.sizeReducedInPercent =
      (conversion.startSizeMB - conversion.endSizeMB) /
      conversion.startSizeMB *
      100

    conversion.end = window.performance.now()
    conversion.elapsedTimeInSeconds = (conversion.end - conversion.start) / 1000
    conversion.endType = photo.type

    return { photo, info: conversion }
  }

  async _loopCompression(canvas, photo, conversion) {
    conversion.iterations++

    photo.setData(await converter.canvasToBlob(canvas, conversion.quality))

    if (conversion.iterations == 1) {
      // Update the photo width and height properties now that the photo data
      // represents an image with these dimensions.
      photo.width = conversion.endWidth
      photo.height = conversion.endHeight
    }

    if (converter.size(photo.size).MB > this.options.targetSize) {
      // toFixed avoids floating point errors messing with inequality
      if (conversion.quality.toFixed(10) - 0.1 < this.options.minQuality) {
        const errorText = `Couldn't compress image to target size while maintaining quality.
        Target size: ${this.options.targetSize}
        Actual size: ${converter.size(photo.size).MB}`

        if (!this.options.throwIfSizeNotReached) {
          console.error(errorText)
        } else {
          throw new Error(errorText)
        }
        return
      } else {
        conversion.quality -= this.options.qualityStepSize
        return await this._loopCompression(canvas, photo, conversion)
      }
    } else {
      return
    }
  }

  compress(files) {
    return Promise.all(files.map((file) => this._compressFile(file)))
  }

  static async blobToBase64(...args) {
    return await converter.blobToBase64(...args)
  }

  static async loadImageElement(...args) {
    return await loadImageElement(...args)
  }
}

// Supported input formats
// image/png, image/jpeg, image/jpg, image/gif, image/bmp, image/tiff, image/x-icon,  image/svg+xml, image/webp, image/xxx
// image/png, image/jpeg, image/webp
export default Compress
