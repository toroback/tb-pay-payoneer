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


var request = require('request');
let moment  = require('moment');

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


    this.url = client.options.url;
    this.username = client.options.username;
    this.password = client.options.password;
    this.programs = client.options.programs;

    // console.log("loaded programs "+ JSON.stringify(this.programs));
    // this.port = client.options.port || defaultPort;
    // this.multiCurrency = client.options.mcp == true;
  }

  processWebhook(data){
    return new Promise((resolve, reject) => {
      this.log.debug("processPayoneerWebhook DATA" + JSON.stringify(data));

      // let ref = undefined;
      // let rid = undefined;
      // let uid = data.payeeid;

      let promise = undefined;
      if(data.type == "account"){
      // if(data.APPROVED || data.DECLINE || data.ReusePayeeID){
        // ref = "account"; //No tiene porqué ser el mismo que data.type, por eso no se hace "ref = data.type"
        
        promise = this.processAccountWebhook(data);


      // }else if(data.PAYMENT || data.LOADCC || data.LOADiACH || data.PaperCheck || data.CancelPayment || data.BankTranferPaymentFailed ){
      // }else if(data.PAYMENT || data.LoadCard ||/* data.LoadBank || data.LoadPaperCheck || data.LoadPayPal ||*/ data.LoadMoney || data.CancelPayment || data.BankTranferPaymentFailed ){  
      }else if(data.type == "transaction"){  
        // ref = "transaction";

        promise = this.processTransactionWebhook(data);

      }else if(data.type == "unhandled"){
        
      }else{
        throw new Error("Unknown webhook type");
      }
      // else{
      //   throw new Error("Unknown webhook type");
      // }
      
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

      if(data.status == "approved"){
        status = "approved";
      }else if(data.status == "rejected"){
        status = "rejected";
      }else if(data.status == "canceled"){
        status = "canceled";
      }

      // if(data.APPROVED){
      //   status = "approved";
      // }else if(data.DECLINE){
      //   status = "rejected";
      // }else if(data.ReusePayeeID){
      //   status = "canceled";
      // }

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

      // if(data.PAYMENT){
      //   status = "accepted";
      // }else if(data.LoadCard /*|| data.LoadBank || data.LoadPaperCheck || data.LoadPayPal*/ || data.LoadMoney){
      //   //LoadMoney engloba LoadBank, LoadPaperCheck, LoadPayPal
      //   status = "received";
      // }else if(data.CancelPayment){
      //   status = "canceled";
      // }else if(data.BankTranferPaymentFailed){
      //   status = "rejected";
      // }

      if(data.status == "accepted"){
        status = "accepted";
      }else if(data.status == "received"){
        status = "received";
      }else if(data.status == "canceled"){
        status = "canceled";
      }else if(data.status == "rejected"){
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

  echo(){
    return new Promise((resolve, reject) => {
      
      let defaultProgram = this.getDefaultProgram();
      let programId = defaultProgram ? defaultProgram.id : undefined;
      
      if(!programId){
        reject({error:App.err.notFound("No programId found")});
      }else{
        GET(this.url +"/"+ programId + "/echo", {auth:{user: this.username, pass: this.password}})
          .then(resolve)
          .catch(reject);
      }
    });
  }

  createRegistrationLink(data){
    return new Promise((resolve, reject) => {
      this.log.debug("registrationLink Data "+ JSON.stringify(data));
      // let uid = data.payload.uid;
      let programId = data.account && data.account.data ? data.account.data.programId : undefined;
      let forLogin = data.forLogin;
      
      if(!programId){
        let defaultProgram = this.getDefaultProgram();
        programId = defaultProgram ? defaultProgram.id : undefined;
      }

      if(!programId){
        reject({error:App.err.notFound("No programId found")});
      }else{
        
        let payload = mapRegistrationLinkPayload(data.payload, forLogin);//{payee_id: uid};
        let reqUrl = this.url +"/"+ programId + "/payees/" + (forLogin ? "login-link" : "registration-link");
        POST(reqUrl, {payload: payload, auth:{user: this.username, pass: this.password}})
          .then(resp=>{
            this.log.debug("registrationLink resp "+ JSON.stringify(resp));
            let link = resp[forLogin ? "login_link" : "registration_link"];
            if(link){
              resolve({link: link, data: {programId: programId}});
            }else{
              reject(resp);
            }
          })
          .catch(reject);

      }
    });
  }

  payout(data){
    return new Promise((resolve,reject)=>{
      let ret = {};

      this.log.debug("Payout from payoneer");
      this.log.debug("payout Data "+ JSON.stringify(data));
      let programId = data.account && data.account.data ? data.account.data.programId : undefined;

      if(!programId){
        ret.error = App.err.notAcceptable("programId must be provided");
        reject(ret);
      }else{ 
        let program = getProgram(this.programs, programId);
        if(!program){
          ret.error = App.err.notFound("program with id " + programId + " not found");
          reject(ret);
        }else{

          if(program.currency != data.payout.currency){
            ret.error = App.err.notAcceptable("invalid currency for selected program: "+data.payout.currency);
            reject(ret);
          }else{

            let payload = {
              payee_id: data.payout.uid,
              amount: data.payout.amount,
              client_reference_id: data.payout._id,
              description: data.payout.description,
              payout_date: moment().format('YYYY-MM-DD'),
              currency: data.payout.currency
              // group_id: ???
            }
            
            POST(this.url +"/"+ programId + "/payouts", {payload: payload, auth:{user: this.username, pass: this.password}})
              .then(resp=>{
                this.log.debug("payout resp "+ JSON.stringify(resp));
                if(resp.code === 0){
                  ret.payoutId = resp.payout_id;
                  // ret.success = true;
                }else{
                  // ret.success = false;
                  ret.error = App.err.notAcceptable(resp.description);
                  // reject(resp)
                }
                ret.response = resp;
              })
              .catch(err =>{
                ret.response = err;
                ret.error = err;
                // ret.success = false;
              })
              .then(res =>{
                if(!ret.error){
                  resolve(ret);
                }else{
                  reject(ret);
                }
              })
              // .catch(reject);
           
            // resolve();
           }
        }
      }
    });
  }

  getDefaultProgram(){
    return this.programs ? this.programs[0] : undefined;
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

function mapRegistrationLinkPayload(payload, forLogin){
  let ret = {};

  if(payload.uid)              ret.payee_id             = payload.uid;
  if(payload.sessionId)        ret.client_session_id    = payload.sessionId;
  if(payload.languageId)       ret.language_id          = payload.languageId;
  if(payload.redirectUrl)      ret.redirect_url         = payload.redirectUrl;
  if(payload.redirectTime)     ret.redirect_time        = payload.redirectTime;

  if(!forLogin){
    if(payload.payoutMethods)    ret.payout_methods_list  = payload.payoutMethods;
    if(payload.registrationMode) ret.registration_mode    = payload.registrationMode;
    if(payload.lockType)         ret.lock_type            = payload.lockType;
    

    //DATOS DE PAYEE
    if(payload.payee){
      let payee = payload.payee;
      ret.payee = {};

      if(payee.type) ret.payee.type = payee.type;

       //DATOS DE COMPANY
       if(payee.company){
        let company = payee.company;
        ret.payee.company = {};

        if(company.legalType)           ret.payee.company.legal_type              = company.legalType;
        if(company.name)                ret.payee.company.name                    = company.name;
        if(company.url)                 ret.payee.company.url                     = company.url;
        if(company.incorporatedCountry) ret.payee.company.incorporated_country    = processCountryCode(company.incorporatedCountry);
        if(company.incorporatedState)   ret.payee.company.incorporated_state      = company.incorporatedState;
      }

      //DATOS DE CONTACT
      if(payee.contact){
        let contact = payee.contact;
        ret.payee.contact = {};

        if(contact.firstName)   ret.payee.contact.first_name    = contact.firstName;
        if(contact.lastName)    ret.payee.contact.last_name     = contact.lastName;
        if(contact.email)       ret.payee.contact.email         = contact.email;
        if(contact.birthDate)   ret.payee.contact.date_of_birth = contact.birthDate;
        if(contact.mobile)      ret.payee.contact.mobile        = contact.mobile;
        if(contact.phone)       ret.payee.contact.phone         = contact.phone; 
      }

      //DATOS DE ADDRESS
      if(payee.address){
        let address = payee.address;
        ret.payee.address = {};

        if(address.country)       ret.payee.address.country         = processCountryCode(address.country);
        if(address.state)         ret.payee.address.state           = address.state;
        if(address.addressLine1)  ret.payee.address.address_line_1  = address.addressLine1;
        if(address.addressLine2)  ret.payee.address.address_line_2  = address.addressLine2;
        if(address.city)          ret.payee.address.city            = address.city;
        if(address.zipCode)       ret.payee.address.zip_code        = address.zipCode; 
      }
     
    }
  }

  return ret;
}

function processCountryCode(code){

  //   "Appendix B – Field Validations:"
  // --> Country:    Two letters, in compliance with ISO 3166-1 alpha-2 Country Code List.  Note that UK is specifically used for United-Kingdom
  if(code == "GB"){
    return "UK";
  }
  return code;
}

function getProgram(programs, id){
  // let config = getServiceConfig(service);
  let program = undefined;
  if(programs){
    program = programs[0];

    programs.forEach(p =>{
      if(p.id == id){
        program = p;
      }
    });
  }
  return program;
}

function POST(url, data){
  return new Promise((resolve, reject)=>{
    request.post({
      url:  url,
      // port: port,
      method:"POST",
      headers:{
          'Content-Type': 'application/json',
      },
      auth: data.auth || undefined,
      body: JSON.stringify( data.payload)
    },
    (error, response, body)=> {
      if (error) reject(error);
      else{
        resolve(JSON.parse(body));
        // parseString(body, (err, result) =>{
        //   if (err) reject(err);
        //   else resolve(result);
        // });         
      }
    });
  })
}

function GET(url, data){
  return new Promise((resolve, reject)=>{
    request.get({
      url:  url,
      // port: port,
      method:"GET",
      headers:{
          'Content-Type': 'application/json',
      },
      auth: data.auth || undefined
    },
    (error, response, body)=> {
      if (error) reject(error);
      else{
        resolve(JSON.parse(body));      
      }
    });
  })
}

module.exports = Adapter;