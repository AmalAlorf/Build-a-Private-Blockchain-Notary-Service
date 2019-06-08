const SHA256 = require('crypto-js/sha256');
const Blockchain = require('./simpleChain.js').Blockchain;
const Block = require('./simpleChain.js');
const BitcoinMessage = require('bitcoinjs-message');
const message_star = 'starRegistry';
/**
 * Controller Definition to encapsulate routes to work with blocks
 */
class BlockController {
    /**
     * Constructor to create a new BlockController, you need to initialize here all your endpoints
     * @param {*} app 
     */
    constructor(app) {
            this.app = app;
            this.blocks = [];
            this.blockchain = new Blockchain();
            this.initializeMockData();
            this.getBlockByIndex();
            this.postNewBlock();
            ////////////validation for 5 minutes "calculation" ///////////////
            this.timeoutRequestsWindowTime = 5 * 60 * 1000;
            this.mempool = new Map();
            this.mempoolValid = new Map();
            this.timeRequests = new Map();
            this.postRequestValidation();
            this.postMessageSignatureValidate();
            this.getStarsHash();
            this.getStartsWalletAddress();
        }
        /**
         * Implement a GET endpoint to retrieve a block by height
         */
    getBlockByIndex() {
            this.app.get("/block/:index", async(req, res) => {
                //Get block hight "index"
                let index = req.params.index;
                try {
                    console.log(`Get block with index ${index}`);
                    //Get block by index
                    let result = await this.blockchain.getBlocksByHeight(index);
                    //convert the block to json format
                    res.json(result);
                    res.end();
                } catch (err) {
                    console.log(`Error: ${err}`);
                    //Bad request
                    res.send(`Error: ${err}`);
                }
            });
        }
        /**
         * Implement a POST endpoint to add a new block, url: "/block"*/
    postNewBlock() {
            this.app.post("/block", (req, res) => {
                // check for request properties
                try {
                    if (req.body.address && req.body.star) {
                        //check for address in memory pool
                        if (!this.mempoolValid.get(req.body.address)) {
                            console.log("Invlaid address in memory pool");
                            return;
                        }
                        let blockBody = req.body;
                        if (!blockBody.star.story || !blockBody.star.dec || !blockBody.star.ra) {
                            console.log(`Invalid request `);
                            return;
                        }
                        blockBody.star.story = Buffer(blockBody.star.story).toString('hex');
                        let block = new Block.Block(blockBody);
                        //add the block ti the chain
                        this.blockchain.addBlock(block).then(_block => {
                            // remove address from mempool valid
                            this.removeValidationRequest(req.body.address);
                            res.json(block);
                            res.end();
                        })
                    } else {
                        console.log(`Invalid address`);
                    }
                } catch (err) {
                    console.log(`Error: ${err}`);
                    res.send(`Error: ${err}`);
                }
            });
        }
        //  Removing Request Validation and mempool     
    removeValidationRequest(walletAddress) {
            this.timeRequests.delete(walletAddress);
            this.mempool.delete(walletAddress);
            this.mempoolValid.delete(walletAddress);
        }
        ///////////////////////
        /**
         * Help method to inizialized Mock dataset, adds 10 test blocks to the blocks array
         */
    initializeMockData() {
            if (this.blocks.length === 0) {
                for (let index = 0; index < 10; index++) {
                    let blockAux = new Block.Block(`Test Data #${index}`);
                    blockAux.height = index;
                    blockAux.hash = SHA256(JSON.stringify(blockAux)).toString();
                    this.blocks.push(blockAux);
                }
            }
        }
        ///////////////postRequestValidation method////////////////////
        // Web API POST endpoint to validate request with JSON response.
    postRequestValidation() {
            this.app.post("/requestValidation", (req, res) => {
                let address = req.body.address;
                if (address) {
                    // check for timeout scope or no
                    if (this.timeRequests.get(address)) {
                        // getting validation Window after calculation
                        let validationWindow = this.calculateValidationWindow(req);
                        //check mempool
                        let response = this.mempool.get(address);
                        response.validationWindow = validationWindow;
                        res.json(response);
                        res.end();
                    } else {
                        // process a new request 
                        this.addRequestValidation(address);
                        // getting validation Window after calculation
                        let validationWindow = this.calculateValidationWindow(req);
                        let response = this.getRequestObject(req, validationWindow);
                        // store in mempool 
                        this.mempool.set(address, response);
                        res.json(response);
                        res.end();
                    }
                } else {
                    console.log("invalid address");
                }
            });
        }
        // Implement adding request Validation 
    addRequestValidation(walletAddress) {
        let requestTimeout = setTimeout(function() {
            this.removeValidationRequest(walletAddress);
        }, this.timeoutRequestsWindowTime);
        this.timeRequests.set(walletAddress, requestTimeout);
    }

    // Implement  calculate validation window .
    calculateValidationWindow(request) {
            let previousResponse = this.mempool.get(request.body.address);
            let timeElapse = 0;
            if (previousResponse) {
                timeElapse = request.requestTimeStamp - previousResponse.requestTimeStamp;
            } else {
                timeElapse = (new Date().getTime().toString().slice(0, -3)) - request.requestTimeStamp;
            }
            let timeLeft = (this.timeoutRequestsWindowTime / 1000) - timeElapse;
            return timeLeft;
        }
        //////////////////////////getRequestObject method//////////////////
    getRequestObject(req, validationWindow) {
            let requestObject = { walletAddress: "", requestTimeStamp: "", message: "", validationWindow: "" };
            requestObject.walletAddress = req.body.address;
            requestObject.requestTimeStamp = req.requestTimeStamp;
            ///set massage 
            requestObject.message = requestObject.walletAddress + ':' + req.requestTimeStamp + ':' + message_star;
            requestObject.validationWindow = validationWindow;
            return requestObject;
        }
        /**
         * Implement /message-signature/validate API to validate the given signature with address wallet by bitcoin library
         */
    postMessageSignatureValidate() {
            this.app.post('/message-signature/validate', (req, res) => {
                let address = req.body.address;
                let signature = req.body.signature;
                let body = req.body;
                if (address && signature) {
                    // verify window time
                    if (this.verifyWidnowTime(body)) {
                        console.log("Expired Window Time ");
                    }
                    // verify whether it exists in the memroy pool , otherwise throws error msg.
                    let memPoolData = this.mempool.get(address);
                    if (!memPoolData) {
                        console.log("Invalid address wallet in memory pool");
                    }
                    // verify the signature must check 
                    let isSignatureValid = this.verifySignature(body);
                    let validationWindows = this.calculateValidationWindow(req);
                    let validRequest = this.createValidRequest(true, memPoolData, validationWindows, isSignatureValid);
                    // save it if it is signature valid.
                    console.log("isSignatureValid  " + isSignatureValid);
                    if (isSignatureValid) {
                        this.mempoolValid.set(address, validRequest);
                    }
                    res.json(validRequest);
                } else {
                    console.log("Invalid address or signature");
                    res.send("Invalid address or signature  ");
                    res.end()
                }
            });
        }
        // verify the address for window time
    verifyWidnowTime(req) {
            if (req.address) {
                return true;
            } else {
                return false;
            }
        }
        // verify the signature based on the given address and signature
    verifySignature(req) {
            let memPool = this.mempool.get(req.address);
            let response = BitcoinMessage.verify(memPool.message, req.address, req.signature);
            return response;
        }
        /////////createValidRequest method ////////////////
    createValidRequest(RegisterStart, poolData, validationWindows, isValid) {
            let RequestObject = {};
            RequestObject.registerStar = RegisterStart;
            RequestObject.status = {};
            RequestObject.status.address = poolData.walletAddress;
            RequestObject.status.requestTimeStamp = poolData.requestTimeStamp;
            RequestObject.status.message = poolData.message;
            RequestObject.status.validationWindow = validationWindows;
            RequestObject.status.messageSignature = isValid;
            return RequestObject;
        }
        ///Get the block using the provided hash
    getStarsHash() {
            this.app.get("/stars/hash::hashdata", async(req, res) => {
                //Get block hash 
                let hashdata = req.params.hashdata;
                try {
                    console.log(`Get block with hashdata ${hashdata}`);
                    //Get block by hash
                    let result = await this.blockchain.getBlockByHash(hashdata);
                    // console.log(`result: ${result}`);
                    //convert the block to json format
                    res.json(result);
                    res.end();
                } catch (err) {
                    console.log(`Error: ${err}`);
                }
            });
        }
        /**
         * Implement starts by address
         */
    getStartsWalletAddress() {
            this.app.get("/stars/address::addressdata", async(req, res) => {
                //Get block address 
                let addressdata = req.params.addressdata;
                try {
                    console.log(`Get block with addressdata ${addressdata}`);
                    //Get block by address
                    let result = await this.blockchain.getBlocksByAddress(addressdata);
                    //  console.log(`result: ${result}`);
                    //convert the block to json format
                    res.json(result);
                    res.end();
                } catch (err) {
                    console.log(`Error: ${err}`);
                }
            });
        }
        //////////////
}
/**
 * Exporting the BlockController class
 * @param {*} app 
 */
module.exports = (app) => { return new BlockController(app); }