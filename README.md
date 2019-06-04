# Udacity Blockchain Developer Nanodegree Program

 Project 3: Connect Private Blockchain to Front-End Client via APIs

# Getting started :
Clone the repository 

# Install all required Node.js packages:
npm install

# Initialize the blockchain:
node SimpleChain.js -i

# Install the Express.js server:
 npm install express --save

# start the Express.js server:
node app.js

# Accessing the API :
Use postman tool and you can download it from : https://www.getpostman.com/downloads/

Send a GET request :
Send block height parameter to retrieve block object in JSON format 
Example : To Get 4th block : http://localhost:8000/block/4

Add new block to the blockchain :
{"body": "Testing block with test string data"} POST http://localhost:8000/block


