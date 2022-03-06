const api = require('binance');
const crypto = require('crypto');
var nodemailer = require('nodemailer');
const fs = require('fs');

const binanceRest = new api.BinanceRest({
    key: 'putyourbinancekeyhere', // Get this from your account on binance.com
    secret: 'putyourbinancesecrethere', // Same for this
    timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
    recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
    disableBeautification: false,
    /*
     * Optional, default is false. Binance's API returns objects with lots of one letter keys.  By
     * default those keys will be replaced with more descriptive, longer ones.
     */
    handleDrift: false
    /* Optional, default is false.  If turned on, the library will attempt to handle any drift of
     * your clock on it's own.  If a request fails due to drift, it'll attempt a fix by requesting
     * binance's server time, calculating the difference with your own clock, and then reattempting
     * the request.
     */
});

var orderid = 0

var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

const seuilCalcul = 1.02; // Seuil à partir duquel on va lancer un trade ; par exemple, 1.03 signifie qu'on a calculé un gain de 3% (les fees sont inclus dans le calcul)
const seuilPrix = 0.0000100; // Seuil de prix en BTC qu'un altcoin doit avoir pour être admis dans le calcul
const fees = 1 - (0.075/100); // Chez Binance, les fees sont de 0,075% avec utilisation de BNB, 0,1% sinon
const BTCQuantity = 0.01; // Quantité de BTC à mettre en jeu lors du premier trade

var coinToTrade1;
var coinToTrade2;
var coin1Price;
var coin2Price;
var ath = 0; 
var dustCounter = 0;
var asset = "";
var minQty = {};
var coinToTrade = [];	
var tradablePairs = [];	

getCoinsToTrade();

function IsATradingPair(pair) {
    var result = 0;
    tradablePairs.forEach(function(item, index, array) {
        if(pair == item)
            result = 1;
    });
    return result;
}


var intervalObj = setInterval(() => {
    getPrices();
}, 10000);

function getPrices() {
    log('appel de getPrices');

    var url = "https://api.binance.com/api/v1/ticker/allPrices";
        
    var ourRequest = new XMLHttpRequest();

    ourRequest.open('GET',url,true);
    ourRequest.onload = function(){

        var data = JSON.parse(ourRequest.responseText);

        log('analyse requête XMLHttp');

        var AltBTC = [];
        var AltBTCTemp = [];
        var AltUSDT = [];
        var symbol;
        var alt;		
        
        try {
            data.forEach(function (ticker) {
            
                var cont = 1;

                // Si les 4 derniers caractères sont 'USDT'
                if(ticker.symbol.substring(ticker.symbol.length - 4) == 'USDT') {
                    symbol = ticker.symbol.substring(ticker.symbol.length - 4);
                    alt = ticker.symbol.substring(0, ticker.symbol.length - 4);
                    //console.log('symbol : ' + symbol + ' ; alt = ' + alt);
                }
                else {
                    symbol = ticker.symbol.substring(ticker.symbol.length - 3);
                    alt = ticker.symbol.substring(0, ticker.symbol.length - 3);
                }
                    
                if(!IsATradingPair(ticker.symbol))	
                    cont = 0;          

                if(cont == 1) {

                    if(symbol == "BTC") {
                        AltBTCTemp.push(alt + '-' + ticker.price);
                        //console.log('push alt/btc : ' + alt + ' - ' + ticker.price);
                    }
                                
                    if(symbol == "USDT") {
                        AltUSDT.push(alt + '-' + ticker.price);
                        //console.log('push alt/usdt : ' + alt + ' - ' + ticker.price);
                    }
                }

            });
        }
        catch (error) {
            console.error(error);
        }
        
        // On parcours le tableau des Alts/BTC
        for (var i = 0; i < AltBTCTemp.length; i++) {
            // On extrait le symbole de l'alt
            var AltTabBTC = AltBTCTemp[i].split("-");
            
            //console.log(AltTabBTC);
            
            // On parcours le tableau des Alts/USDT
            for (var j = 0; j < AltUSDT.length; j++) {
                var AltTabUSDT = AltUSDT[j].split("-");
                
                if(AltTabBTC[0] == AltTabUSDT[0]) {
                    AltBTC.push(AltTabBTC[0] + '-' + AltTabBTC[1]);
                }				
            }
        }
        var soundAlert = 0;
        var showTime = 0;
        var max = 0;
        var paire = '';
        var Alt1Symbol;
        var Alt2Symbol;
        
        // On parcours le tableau des Alts/BTC
        for (var i = 0; i < AltBTC.length; i++) {
            
            var cont = 0;

            // On extrait le symbole de l'alt n°1
            var AltTabBTC = AltBTC[i].split("-");
            
            Alt1Symbol = AltTabBTC[0];

            // On récupère uniquement les alts qui ont assez de volume
            coinToTrade.forEach(function(item, index, array) {
                if(Alt1Symbol == item)
                    cont = 1;
            });

            if(cont == 1) {

                // On parcours le tableau des Alts/USDT
                for (var j = 0; j < AltUSDT.length; j++) {
                    var AltTabUSDT = AltUSDT[j].split("-");
                    // On extrait le symbole de l'alt n°2
                    Alt2Symbol = AltTabUSDT[0];
                    
                    cont = 0;
                    
                    // On récupère uniquement les alts qui ont assez de volume
                    coinToTrade.forEach(function(item, index, array) {
                        if(Alt2Symbol == item)
                            cont = 1;
                    });
                    
                    if(cont == 1) {
                        // On récupère les prix
                        var Alt1BTCPrice = AltTabBTC[1]; // le prix de l'alt n°1 en BTC
                        var Alt2USDTPrice = AltTabUSDT[1]; // le prix de l'alt n°2 en USDT	

                        // On récupère le prix de l'alt n°1 en USDT
                        for (var k = 0; k < AltUSDT.length; k++) {
                            var AltTabUSDT2 = AltUSDT[k].split("-");
                            
                            if(Alt1Symbol == AltTabUSDT2[0]) {
                                var Alt1USDTPrice = AltTabUSDT2[1];
                            }					
                        }
                        
                        // On récupère le prix de l'alt n°2 en BTC
                        for (var k = 0; k < AltBTC.length; k++) {
                            var AltTabBTC2 = AltBTC[k].split("-");
                            
                            if(Alt2Symbol == AltTabBTC2[0]) {
                                var Alt2BTCPrice = AltTabBTC2[1];
                            }					
                        }

                        // On ne récupère que les alts qui ont un prix en BTC supérieur à un minimum
                        if(Alt1BTCPrice > seuilPrix && Alt2BTCPrice > seuilPrix) {
                            // Calcul
                            // Les 0,025 % de frais sont
                            var calcul = (((1/(Alt1BTCPrice * fees)) * (Alt1USDTPrice * fees)) / (Alt2USDTPrice * fees)) * (Alt2BTCPrice * fees);

                            if(calcul > seuilCalcul) {
                            
                                if(calcul > max) {
                                    max = calcul;
                                    paire = Alt1Symbol + '/' + Alt2Symbol;
                                    maxlog = Alt1Symbol + '/' + Alt2Symbol + ' : ' + calcul + ' (' + Alt1Symbol + '/BTC : ' + Alt1BTCPrice + ' ; ' + Alt1Symbol + '/USDT : ' + Alt1USDTPrice + ' ; ' + Alt2Symbol + '/USDT : ' + Alt2USDTPrice + ' ; ' + Alt2Symbol + '/BTC : ' +  Alt2BTCPrice + ' ) ';
                                    coinToTrade1 = Alt1Symbol;
                                    coinToTrade2 = Alt2Symbol;  
                                    coin1Price = Alt1BTCPrice;  
                                    coin2Price = Alt2USDTPrice;                                
                                }

                                console.log(Alt1Symbol + '/' + Alt2Symbol + ' : ' + calcul + ' (' + Alt1Symbol + '/BTC : ' + Alt1BTCPrice + ' ; ' + Alt1Symbol + '/USDT : ' + Alt1USDTPrice + ' ; ' + Alt2Symbol + '/USDT : ' + Alt2USDTPrice + ' ; ' + Alt2Symbol + '/BTC : ' +  Alt2BTCPrice + ' ) ')
                            }				
                        }                        
                    }                    
                }
            }
        }
        
        if(max > 0) {  
            console.log('############################################');
            
            if(max > ath) {
                ath = max;
                console.log('ATH : ' + maxlog);
            }
            else {
                console.log('MAX : ' + maxlog);
            }
            
            // Début des TRADES !!
            clearInterval(intervalObj);

            slog("Arbitrage en cours : " + maxlog);

            sendMail("Arbitrage en cours", maxlog);

            BTC_To_Coin1();

        }

    }
    ourRequest.send();    

}

function setQuantity(startQty, coinPrice, cointoTrade, symbol) {
    var qty = startQty / coinPrice;
    slog('start qty= ' + qty);

    minqty = parseInt(minQty[cointoTrade + symbol]);
    slog('minQty = ' + minqty);

    if(minqty == 0) {
        qty = Math.trunc(qty);
    }
    else{
        qty = qty.toFixed(minqty);
    }
    slog('end qty= ' + qty);

    return qty;
}

// 1. Achat COIN 1 contre du BTC
// COIN 1 = coinToTrade1 
function BTC_To_Coin1() {

    slog("Dans BTC_To_Coin1");

    qty = setQuantity(BTCQuantity, coin1Price, coinToTrade1, 'BTC');

    slog('Achat de ' + qty + ' de ' + coinToTrade1 + ' contre du BTC');

    binanceRest.newOrder(
        {
            symbol: coinToTrade1 + 'BTC',
            side: 'BUY',
            type: 'MARKET',
            quantity: qty
        })
        .then((data) => {
            slog('orderId = ' + orderid)
            orderid = data.orderId        
            queryOrder1(orderid);
        })
        .catch((err) => {
            console.error('erreur BTC_To_Coin1 : ');
            console.error(err);
        }
    );
}

function queryOrder1(orderid) {

    slog("Dans queryOrder1");

    binanceRest.queryOrder(
        {
            symbol: coinToTrade1 + 'BTC',
            orderId: orderid
        })
        .then((data) => {
            slog('data = ' + data);
            qty = data.executedQty
            Coin1_To_USDT(qty);
        })
        .catch((err) => {
            console.error('erreur queryOrder1 : ');
            console.error(err);
            slog('Nouvelle tentative');
            queryOrder1(orderid);
        }
    );
}

// 2. Vente COIN 1 pour de l'USDT 
function Coin1_To_USDT(quantity) {

    slog("Dans Coin1_To_USDT");

    var qty = quantity * 1.0;

    slog('qty = ' + qty + ' ; minQty = ' + minQty[coinToTrade1 + 'USDT']);
    minqty = parseInt(minQty[coinToTrade1 + 'USDT']);

    if(minqty == 0) {
        qtyToTrade = Math.trunc(qty);
    }
    else{
        qtyToTrade = qty.toFixed(minqty);
    }

    log('Vente de ' + qtyToTrade + ' de ' + coinToTrade1 + ' contre USDT');

    binanceRest.newOrder(
        {
            symbol: coinToTrade1 + 'USDT',
            side: 'SELL',
            type: 'MARKET',
            quantity: qtyToTrade
        })
        .then((data) => {
            orderid = data.orderId        
            queryOrder2(orderid);
        })
        .catch((err) => {
            console.error('erreur Coin1_To_USDT : ');
            console.error(err);
        }
    );
}

function queryOrder2(orderid) {

    slog("Dans queryOrder2");

    binanceRest.queryOrder(
        {
            symbol: coinToTrade1 + 'USDT',
            orderId: orderid
        })
        .then((data) => {
            slog('data = ' + data);
            qty = data.executedQty
            USDT_To_Coin2(qty);
        })
        .catch((err) => {
            console.error('erreur queryOrder2 : ');
            console.error(err);
            slog('Nouvelle tentative');
            queryOrder2(orderid);
        }
    );
}
 
// 3. Achat COIN 2 contre de l'USDT	
// Coin 2 = coinToTrade2
function USDT_To_Coin2(qty) {

    slog("Dans USDT_To_Coin2");

    qtyToTrade = setQuantity(qty, coin2Price, coinToTrade2, 'USDT');

    slog('Achat de ' + qtyToTrade + ' de ' + coinToTrade2 + ' contre USDT');
    slog('(qty = ' + qtyToTrade + ' ; coin2Price = ' + coin2Price + ')')

    binanceRest.newOrder(
        {
            symbol: coinToTrade2 + 'USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: qtyToTrade
        })
        .then((data) => {
            orderid = data.orderId        
            queryOrder3(orderid);
        })
        .catch((err) => {
            console.error('erreur USDT_To_Coin2 : ');
            console.error(err);
        }
    );
}

function queryOrder3(orderid) {

    slog("Dans queryOrder3");

    binanceRest.queryOrder(
        {
            symbol: coinToTrade2 + 'USDT',
            orderId: orderid
        })
        .then((data) => {
            slog('data = ' + data);
            qty = data.executedQty
            Coin2_To_BTC(qty);
        })
        .catch((err) => {
            console.error('erreur queryOrder3 : ');
            console.error(err);
            slog('Nouvelle tentative');
            queryOrder3(orderid);
        }
    );
}

// 4. Vente COIN 2 contre du BTC
function Coin2_To_BTC(quantity) {

    slog("Dans Coin2_To_BTC");

    var qty = quantity * 1.0;

    minqty = parseInt(minQty[coinToTrade2 + 'BTC']);

    if(minqty == 0) {
        qtyToTrade = Math.trunc(qty);
    }
    else{
        qtyToTrade = qty.toFixed(minqty);
    }

    slog('Vente de ' + qtyToTrade + ' de ' + coinToTrade2 + ' contre BTC');

    binanceRest.newOrder(
        {
            symbol: coinToTrade2 + 'BTC',
            side: 'SELL',
            type: 'MARKET',
            quantity: qtyToTrade
        })
        .then((data) => {
            orderid = data.orderId        
            queryOrder4(orderid);      
        })
        .catch((err) => {
            console.error('erreur Coin2_To_BTC : ');
            console.error(err);
        }
    );
}

function queryOrder4(orderid) {

    slog("Dans queryOrder4");

    binanceRest.queryOrder(
        {
            symbol: coinToTrade2 + 'BTC',
            orderId: orderid
        })
        .then((data) => {
            slog('data = ' + data);
            qty = data.executedQty
            transferDust();
        })
        .catch((err) => {
            console.error('erreur queryOrder4 : ');
            console.error(err);
            slog('Nouvelle tentative');
            queryOrder4(orderid);
        }
    );
    
}

function transferDust() {

    slog("Dans transferDust");

    dustCounter++;
    if(dustCounter == 1){
        asset = "USDT";
    }
    else if(dustCounter == 2){
        asset = coinToTrade1;
    }
    else if(dustCounter == 3){
        asset = coinToTrade2;
    }
    else {}

    if(dustCounter < 4){
        var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

        var keys = {
            "API_KEY" : 'putyourbinancekeyhere',
            "API_SECRET" : 'putyourbinancesecrethere'
        }
        
        var binance_api_url = 'https://api.binance.com';
        var endpoint = '/sapi/v1/asset/dust';
        var dataQueryString = 'asset=' + asset +'&timestamp=' + Date.now();
        
        var Signature = crypto.createHmac("sha256", keys['API_SECRET']).update(dataQueryString).digest('hex')
        
        var url = binance_api_url + endpoint + '?' + dataQueryString + '&signature=' + Signature;
        
        var ourRequest = new XMLHttpRequest();
        
        ourRequest.open('POST',url,true);
        ourRequest.setRequestHeader('X-MBX-APIKEY', keys['API_KEY'])
        
        ourRequest.onload = function(){
            slog(ourRequest.responseText)
            transferDust();
        }
        
        slog(asset);
        ourRequest.send();
    }
    else {
        slog("FIN");
        process.exit();
    }
}

function getCoinsToTrade() {
    console.log('appel de getCoinsToTrade');

    var url = "https://api.binance.com/api/v3/ticker/24hr";
        
    var ourRequest = new XMLHttpRequest();

    ourRequest.open('GET',url,true);

    ourRequest.onload = function(){

        var data = JSON.parse(ourRequest.responseText);

        var symbol;
        var alt;	
        var counter = 0;	
        
        try {
            data.forEach(function (ticker) {
                // Si les 3 derniers caractères sont 'BTC'
                if(ticker.symbol.substring(ticker.symbol.length - 3) == 'BTC') {
                    symbol = ticker.symbol.substring(ticker.symbol.length - 3);
                    alt = ticker.symbol.substring(0, ticker.symbol.length - 3);

                    if(ticker.quoteVolume > 200) {
                        console.log('alt = ' + alt);
                        coinToTrade.push(alt);
                    }
                }

            });
        }
        catch (error) {
            console.error(error);
        }

        coinToTrade.forEach(function(item, index, array) {
            tradablePairs.push(item + 'BTC');
        });
        
        coinToTrade.forEach(function(item, index, array) {
            tradablePairs.push(item + 'USDT');
        });

        log('Récupération de la précision pour les assets');
        binanceRest.exchangeInfo( (err, data) => 
        {
            if (err) 
            {
                console.error('erreur : ');
                console.error(err);
            } 
            else
            {
                data.symbols.forEach((symbol) => {
                    tradablePairs.forEach(function (ticker) 
                    {
                        if(ticker == symbol.symbol)
                        {
                            num = new Number(symbol.filters[2].minQty);

                            if(num == 1) {
                                minQty[ticker] = 0;
                            }
                            else {
                                minqty = parseInt(num.toString().length - 2);  
                                if(minqty < 0)    
                                    minqty=-minqty;        
                                minQty[ticker] = minqty;                                
                            }
                        }
                    });
        
                });                  
            }
        });

    }    
    ourRequest.send();   
}

function hms()
{
    var date = new Date();
    var heures = date.getHours();
    var minutes = date.getMinutes();
    var secondes = date.getSeconds();
    if(heures < 10)
        heures = "0" + heures;
    if(minutes < 10)
        minutes = "0" + minutes;
    if(secondes < 10)
        secondes = "0" + secondes;
      
    return heures + ":" + minutes + ':' + secondes;
}

function log(message) {
    console.log(hms() + ' : ' + message);
}

function slog(message){
    var year = new Date().getFullYear().toString();
    var month = new Date().getMonth();
    var day = new Date().getDate();
    
    month++;
    month = month.toString();
    
    day = day.toString();
    
    if(day.length == 1)
        day = "0" + day;
    
    if(month.length == 1)
        month = "0" + month;

    log(message);

    fs.appendFile('log_' + year + '_' + month + '_' + day + '.txt', '\n' + message, function (err) {
        if (err) throw err;

     });
}

function sendMail(objet, content){
    let transport = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: 'john.doe@gmail.com',
            pass: 'JohnDoePswd'
        }
    });
    const message = {
        from: 'elonmusk@tesla.com', // Sender address
        to: 'john.doe@gmail.com',   // List of recipients
        subject: objet, // Subject line
        text: content // Plain text body
    };
    transport.sendMail(message, function(err, info) {
        if (err) {
        console.log("erreur d'envoi de mail : " + err)
        } else {
        console.log("Envoi de mail réussi");
        }
    });
}