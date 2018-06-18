/** 
 * @module tb-pay-payoneer
 *
 * @description 
 *
 * <p>
 * Módulo que permite realizar pagos a distintas cuentas a través del servicio Payoneer. Este servicio se utiliza a través del módulo <b>tb-pay</b>
 * <p>
 * 
 * @see [Guía de uso]{@tutorial tb-pay-payoneer} para más información.
 * @see [REST API]{@link module:tb-pay/routes} (API externo).
 * @see [Class API]{@link module:tb-pay-payoneer.Adapter} (API interno).
 * @see Repositorio en {@link https://github.com/toroback/tb-pay-payoneer|GitHub}.
 * </p>
 * 
 */


// var request = require('request');


// var url;
// var port;

/**
 * Adaptador del servicio Payoneer
 * @memberOf module:tb-pay-payoneer
 */
class Adapter{
  /**
   * Crea un adaptador de Payoneer
   * @param  {Object} client                         Objeto con la informacion para crear el adaptador.
   */
  constructor(_app, client){
    this.app = _app;
    this.log = _app.log.child({module:'Pay-Payoneer'});
    this.client = client;
    // this.providerName = SERVICE_PROVIDER_NAME;
    // this.credential = {
    //   // Merchandt       : client.options.merchandt,
    //   TerminalID      : client.options.terminalId,
    //   SharedSecret    : client.options.sharedSecret
    //   // appSecret   : client.options.appSecret,
    //   // accessToken : client.options.accessToken,
    //   // timeout     : client.options.timeout || 1000
    // }

    // this.url = client.options.url || defaultUrl;
    // this.port = client.options.port || defaultPort;
    // this.multiCurrency = client.options.mcp == true;
  }

  processWebhook(data){
    return new Promise((resolve, reject) => {
      console.log("processPayoneerWebhook DATA" + JSON.stringify(data));

      let ref = undefined;
      let rid = undefined;
      let uid = data.payeeid;

      let promise = undefined;
      if(data.APPROVED || data.DECLINE || data.ReusePayeeID){
        ref = "account";
        
        promise = this.processAccountWebhook(data);


      // }else if(data.PAYMENT || data.LOADCC || data.LOADiACH || data.PaperCheck || data.CancelPayment || data.BankTranferPaymentFailed ){
      }else if(data.PAYMENT || data.LoadCard || data.LoadBank || data.LoadPaperCheck || data.LoadPayPal || data.CancelPayment || data.BankTranferPaymentFailed ){  
        ref = "transaction";

        promise = this.processTransactionWebhook(data);

      }else{
        throw new Error("Unknown webhook type");
      }
      
      if(promise){
        promise.then(resolve).catch(reject);
      }else{
        resolve({});  
      }
      
    });
  }

  processAccountWebhook(data){
    return new Promise((resolve, reject) => {
      let status = undefined;

      if(data.APPROVED){
        status = "approved";
      }else if(data.DECLINE){
        status = "rejected";
      }else if(data.ReusePayeeID){
        status = "canceled";
      }

      let res = {
        ref : "account",
        data : {
          uid: data.apuid,
          status : status,
          sUserId : data.payoneerid
        }  
      };
      resolve(res);

    });
  }

  processTransactionWebhook(data){
    return new Promise((resolve, reject) => {
      let status = undefined;

      if(data.PAYMENT){
        status = "accepted";
      }else if(data.LoadCard || data.LoadBank || data.LoadPaperCheck || data.LoadPayPal){
        status = "received";
      }else if(data.CancelPayment){
        status = "canceled";
      }else if(data.BankTranferPaymentFailed){
        status = "rejected";
      }

      let res = {
        ref : "transaction",
        data : {
          paymentId: data.IntPaymentId, 
          payoneerPaymentId: data.PaymentId,
          uid: data.apuid,
          status: status,
          reasonCode: (status == "rejected" ? data.ReasonCode : undefined),
          reasonDesc: (status == "rejected" ? data.ReasonDescription : undefined)
        }  
      };
      resolve(res);
    });
  }

  ///////////-------------Lib------------------------------
  //Register a credit card
  //parameters
  //   cardNumber:demoCreditCard.MasterCard,
  //   cardExpiry:"1220",
  //   cardType:"MASTERCARD",
  //   cardHolderName:"Messi"  
  /**
   * Registra una tarjeta de credito
   * @param  {Object} data Información de la tarjeta a registrar.
   * @param  {String} data.merchantRef Identificador para la tarjeta de crédito. 
   * @param  {String} data.cardNumber Número de la tarjeta de crédito.
   * @param  {String} data.cardExpiry Fecha de vencimiento de la tarjeta de crédito en formato "MMYY" (Ej:0920 -> "Septiembre de 2020").
   * @param  {String} data.cardType  Tipo de tarjeta de crédito (EJ: MASTERCARD).
   * @param  {String} data.cardHolderName Nombre en la tarjeta de crédito.
   * @param  {String} data.cvv CVV de la tarjeta de crédito.
   * @return {Promise<PaymentRegisterSchema>} Promesa con la información del registro
   */
  // register(data) {
  //   return new Promise((resolve, reject)=>{
  //     let regts = new Date();
  //     var dateTime =  moment.utc(regts).format("DD-MM-YYYY:HH:mm:ss:SSS");
  //     var hash     =  hashData([
  //       this.credential.TerminalID,
  //       data.merchantRef,
  //       dateTime,
  //       data.cardNumber,
  //       data.cardExpiry,
  //       data.cardType,
  //       data.cardHolderName,
  //       this.credential.SharedSecret
  //     ]);

  //     // console.log("Register data" , data);
  //     // console.log("Generated hash" , hash);
  //     var payload  = {
  //       "SECURECARDREGISTRATION":[
  //           // {"MERCHANTREF"    : this.credential.Merchandt},
  //           {"MERCHANTREF"    : data.merchantRef},
  //           {"TERMINALID"     : this.credential.TerminalID},
  //           {"DATETIME"       : dateTime},
  //           {"CARDNUMBER"     : data.cardNumber},
  //           {"CARDEXPIRY"     : data.cardExpiry},
  //           {"CARDTYPE"       : data.cardType},
  //           {"CARDHOLDERNAME" : data.cardHolderName},
  //           {"HASH"           : hash}
  //         ]
  //     }
  //     if(data.cvv){
  //       payload.SECURECARDREGISTRATION.push({"CVV" : data.cvv});
  //     }
  //     // console.log("entra en payments.register globalonepay", payload)
  //     req(this.url, this.port, xml(payload, { declaration: true }))
  //     .then(resp=>{
  //      // console.log(resp);
  //       console.log("globalonepay register resp", JSON.stringify(resp));
  //       if (resp.ERROR){
  //         //manejar la situacion con error code
  //         reject(createError(resp.ERROR));
  //         //{ ERROR: { ERRORCODE: [ 'E08' ], ERRORSTRING: [ 'INVALID MERCHANTREF' ] } }
  //         //{ ERROR: { ERRORCODE: [ 'E13' ], ERRORSTRING: [ 'INVALID HASH' ] } }
  //         //{ ERROR: { ERRORCODE: [ 'E10' ], ERRORSTRING: [ 'INVALID CARDNUMBER' ] } }
  //       }else {
  //         //Guardar en bd
  //         //verificar md5

  //         let registration = {
  //           reference: resp.SECURECARDREGISTRATIONRESPONSE.CARDREFERENCE[0],
  //           cardHolderName: data.cardHolderName,
  //           cardExpiry: data.cardExpiry,
  //           cardNumber: hideCardNumber(data.cardNumber),
  //           regts: moment.utc(resp.SECURECARDREGISTRATIONRESPONSE.DATETIME[0], 'DD-MM-YYYY:HH:mm:ss:SSS').toDate(),//regts,
  //           regrespts: moment.utc(new Date()).toDate(),
  //           active: true,
  //           serviceProvider : this.providerName,
  //           originalResponse: resp
  //         }

  //         resolve(registration);
  //       }
  //     })
  //     .catch(err=>{
  //       //MANEJAR ERROR
  //       reject(err);
  //     })    
  //   })
  // }

}

// function req(url, port, payload){
//   return new Promise((resolve, reject)=>{
//     request.post({
//       url:  url,
//       port: port,
//       method:"POST",
//       headers:{
//           'Content-Type': 'application/xml',
//       },
//        body: payload
//     },
//     (error, response, body)=> {
//       if (error) reject(error);
//       else{
//         parseString(body, (err, result) =>{
//           if (err) reject(err);
//           else resolve(result);
//         });         
//       }
//     });
//   })
// }

module.exports = Adapter;