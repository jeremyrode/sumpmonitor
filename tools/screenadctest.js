#!/usr/bin/node
const LCD = require('raspberrypi-liquid-crystal');
const ADS1115 = require('ads1115')

const lcd = new LCD( 1, 0x27, 20, 4 );
lcd.beginSync();
lcd.clearSync();
lcd.printLineSync(0, 'This is line 1');
lcd.printLineSync(1, 'This is line 2');
lcd.printLineSync(2, 'Combined Test working');


ADS1115.open(0, 0x48).then(async (ads1115) => {
  ads1115.gain = 1

  for (let i = 0; i < 1000; i++) {
    let x = await ads1115.measure('0+GND')
    let y = await ads1115.measure('1+GND')
    lcd.printLineSync(3, `${x} ${y}`);
  }
})
