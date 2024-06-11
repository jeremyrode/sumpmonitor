#!/usr/bin/node
const ADS1115 = require('ads1115')


ADS1115.open(0, 0x48).then(async (ads1115) => {
  ads1115.gain = 1

  for (let i = 0; i < 1000; i++) {
    let x = await ads1115.measure('0+GND')
    let y = await ads1115.measure('1+GND')
    console.log(x, y)
  }
})
