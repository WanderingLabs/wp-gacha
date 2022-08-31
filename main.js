const ethers = require('ethers');
const seedrandom = require('seedrandom');
const fs = require('fs');
const assert = require('assert');
const util = require('node:util');

const gachaCounts = [
    50,
    50,
    50,
    50,
    45,
    45,
    45,
    45,
    40,
    40,
    40,
    40,
    35,
    35,
    35,
    35,
    30,
    30,
    30,
    30,
    25,
    25,
    25,
    25,
    20,
    20,
    20,
    20,
    19
];
const MainnetStakeContractABI = require("./contracts/mainnet_stake.json");
const MainnetGiftContractABI = require("./contracts/mainnet_gift.json");
const network = "mainnet";
const contractStakeAddress =  "0x5EE1f4019F4CD9009c5a0934005B5d8304eaf331";
const contractGiftAddress =  "0x288eb14b72fFd1cb466Fc6fa1EE48Fd8e9eb0BE1";

const contractStakeABI =  MainnetStakeContractABI ;
const contractGiftABI =  MainnetGiftContractABI ;

//must modify step after restart
let step = 0;
const privateKey = "*************";
const apiKey = "*******";

const blockMantissa = 0;
const blockHeightInv = 10000;
function getNextGachaBlockNumber(blkn) {
    if (blkn % blockHeightInv > blockMantissa) {
        return (Math.floor(blkn / blockHeightInv) + 1) * blockHeightInv + blockMantissa;
    } else {
        return Math.floor(blkn / blockHeightInv) * blockHeightInv + blockMantissa;
    }
}
function checkGachaBlockNumber(blkn) {
    return blkn % blockHeightInv == blockMantissa;
}
async function main() {
    log(`wp-gacha start`);
    // load metadata
    const metadata = JSON.parse(fs.readFileSync(`./metadata.json`));
    let provider = new ethers.getDefaultProvider(network, { etherscan: apiKey });
    let rewardTimes = Number(await new ethers.Contract(
        contractGiftAddress,
        contractGiftABI.abi,
        provider
    ).rewardTimes());
    log(`program step = ${step},contract step = ${rewardTimes}`);
    assert(step == rewardTimes, "the program step is inconsistent of the contract");
    
    provider.on("block", (blkn) => {
        //when block number is xxxxx
        if (step >= gachaCounts.length) {
            log(`current block height is ${blkn}, gacha already end at step ${step}`);
            return;
        }
        log(`current block height is ${blkn}, next gacha heigth is ${getNextGachaBlockNumber(blkn)}, next step is ${step + 1}`);

        if (checkGachaBlockNumber(blkn) && step < gachaCounts.length) {
            log(`${step + 1} gacha start`);
            provider.getBlock(blkn).then(async (block) => {
                let retries;
                let maxRetries = 2;
                let wallet = new ethers.Wallet(privateKey, provider);
                let giftContract = new ethers.Contract(
                    contractGiftAddress,
                    contractGiftABI.abi,
                    provider
                );
                let signerGiftContract = giftContract.connect(wallet);

                let newNonce = await wallet.getTransactionCount();
                console.log("new nonce ", newNonce);
                let txHash = null;
                for (retries = 1; retries <= maxRetries; retries++) {
                    try {
                        txHash = null;
                        log("connect to contract");
                        let stakeContract = new ethers.Contract(
                            contractStakeAddress,
                            contractStakeABI.abi,
                            provider
                        );
                        log("get stake list");
                        const [tokens, valid] = await stakeContract.getValidStakes();
                        const validTokens = [];
                        const srcTokens = [];
                        for (let i = 0; i < tokens.length; i++) {
                            srcTokens[i] = Number(tokens[i]);
                            if (valid[i]) {
                                validTokens.push(srcTokens[i]);
                            }
                        }
                        log("gacha start");
                        let result = gacha(block.hash, validTokens, gachaCounts[step], metadata);
                        log("gacha result ", result);
                        //check contract
                        let rewardTimes = Number(await signerGiftContract.rewardTimes());
                        log("contract step ", rewardTimes);
                        assert(step == rewardTimes, "the program step is inconsistent of the contract");
                        log("write into contract ");
                        let overrides = {
                                nonce:newNonce,
                                };
                        let tx = await signerGiftContract.genesisGlance(result, overrides);
                        txHash = tx.hash;
                        log("wait for contract processing ", tx.hash);
                        await tx.wait();
                        break;
                    } catch (err) {
                        log(`gacha failure, err =`, err);
                        log(`${retries} retry`);
                    }
                }
                if (retries > maxRetries) {
                    const title = `WP ${step + 1} gacha falure, retries ${retries - 1}`;
                    log(title);

                } else {
                    const title = `WP ${step + 1} gacha success`;
                    log(title);
                    step++;
                }
            });
        }
    })

};


/**
 * @param {String} seed  block hash when gacha as block height == ****0000
 * @param {Array<Integer>} tokenList all valid stake token list, get from stack contract
 * @param {Integer} resultCount object reward count
 * @param {Array<Object>} metadata all planet metadata include devinity value
 */
function gacha(seed, tokenList, resultCount, metadata) {
    tokenList = tokenList.sort((a, b) => a - b);
    log("begin gacha ", seed, tokenList, resultCount);
    const rand = seedrandom(seed);
    let gachaBox = [];
    tokenList.map((token) => {
        let tokenWeight = Math.floor(metadata[token].devinity * 10);
        gachaBox.push(...Array(tokenWeight).fill(token));
    })
    let result = [];
    for (let i = 0; i < resultCount; i++) {
        let randNumber = rand() * gachaBox.length;
        log("randNumber = ", randNumber);
        let token = gachaBox[Math.floor(randNumber)];
        result.push(token);
    }
    return result.sort((a, b) => a - b);
}


var log = function (message, ...optionalParams) {
    fs.appendFileSync('/tmp/sample-app.log', new Date().toLocaleString() + ' - ' + util.format(message, ...optionalParams) + '\n');
    console.log(message, ...optionalParams);
};

main();
