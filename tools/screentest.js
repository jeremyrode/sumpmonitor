#!/usr/bin/node
const LCD = require('raspberrypi-liquid-crystal');
const lcd = new LCD( 1, 0x27, 20, 4 );
lcd.beginSync();

lcd.clearSync();


lcd.printLineSync(0, 'This is line 1');
lcd.printLineSync(1, 'This is line 2');
lcd.printLineSync(2, 'Fuck This');
