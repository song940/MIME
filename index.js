const util   = require('util');
const Stream = require('stream');
const types  = require('./types');

/**
 * [MIME description]
 */
class MIME extends Stream {
  constructor(headers, body){
    super();
    this.status = 0;
    this.body = body;
    this.content  = '';
    this.headers = Array.isArray(headers) ? 
      headers.map(x => new Header(x)) : 
      Object.keys(headers || {}).map(name => new Header(name, headers[name]));
    return this;
  }
};

MIME.CRLF = '\r\n';
MIME.TYPES = types;

/**
 * [PARSE_STATUS description]
 * @type {Object}
 */
MIME.PARSE_STATUS = {
  HEADER : 0x00,
  BODY   : 0x01,
};

MIME.q = function(address){
  return '<' + address + '>';
};

MIME.kv = function(key, value){
  return [ key, value ].join(': ');
};

MIME.trim = function(s){
  return s.replace(/^"|"$/g, '');
}

MIME.filter = function(str){
  return !!str.trim();
};

/**
 * [extension description]
 * @param  {[type]} type [description]
 * @return {[type]}      [description]
 */
MIME.extension = function(type){
  return MIME.TYPES[ type ].extensions;
};

/**
 * [lookup description]
 * @param  {[type]} filename [description]
 * @return {[type]}          [description]
 */
MIME.lookup = function(filename){
  var ext = filename.replace(/.*[\.\/\\]/, '').toLowerCase();
  return Object.keys(MIME.TYPES).filter(function(type){
    var def = MIME.TYPES[ type ];
    return ~(def.extensions||[]).indexOf(ext);
  })[0];
};

class Header {
  constructor(name, value, options){
    if(arguments.length === 1){
      Object.assign(this,
        typeof name === 'string' ? Header.parse(name) : name);
    }else{
      this.name = name;
      this.value = value;
      this.options = options;
    }
  }
  toString(){
    const { name, value, options } = this;
    return Object.keys(options || {}).reduce((s, k) => {
      return `${s}; ${k}=${options[k]}`;
    }, `${name}: ${value}`);
  }
  static parse(str){
    // a: b; a=1;b=2
    var p = str.indexOf(':');
    if(p > -1){
      const k = str.substr(0, p).trim();
      const s = str.substr(++p).trim();
      const h = Header.parseValue(s);
      h.name = k;
      return h;
    }
    throw new SyntaxError(`[mime] header syntax error: ${str}`);
  }
  static parseValue(str){
    var v, o = {};
    str.split(/;\s?/).forEach(p => {
      const kv = p.match(/^(.+?)=(.*)$/);
      if(kv) o[kv[1]] = MIME.trim(kv[2]);
      else {
        v && [v];
        Array.isArray(v) ? v.push(p) : v = p;
      }
    });
    return new Header(null, v, o);
  }
}

MIME.Header = Header;

MIME.prototype.addHeader = function(header, value, options){
  if(!(header instanceof Header))
    header = new Header(header, value, options);
  this.headers.push(header);
  return this;
};

/**
 * [write description]
 * @param  {[type]} buf [description]
 * @return {[type]}     [description]
 */
MIME.prototype.write = function(buf){
  this.content += buf;
  this.content = this.content
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\r\n');
  var LINE = MIME.CRLF + MIME.CRLF;
  var sp = this.content.indexOf(LINE);
  if(this.status === MIME.PARSE_STATUS.HEADER && sp > -1){
    var header = this.content.substr(0, sp);
    this.headers = MIME.parseHeaders(header);
    this.emit('headers', this.headers);
    this.status = MIME.PARSE_STATUS.BODY;
    this.content = this.content.substr(sp);
  }
  if(this.status === MIME.PARSE_STATUS.BODY){
    const contentType = this.getHeader('content-type');
    if(contentType.value.indexOf('multipart/') === 0){
      const { boundary } = contentType.options;
      const lines = this.content.split(MIME.CRLF);
      var message, parts = [];
      lines.forEach(line => {
        if(line === `--${boundary}--`){
          message && parts.push(message.end());
          this.body = parts;
        } else if(line === `--${boundary}`){
          message&& parts.push(message.end());
          message = new MIME();
        }else if(message){
          message.write(line + MIME.CRLF);
        }
      });
    }else{
      this.body = this.content.trim();
    }
  }
  return this;
};

/**
 * [end description]
 * @param  {[type]} buf [description]
 * @return {[type]}     [description]
 */
MIME.prototype.end = function(buf){
  if(buf) this.write(buf);
  this.emit('body', this.body);
  this.emit('end', this.headers, this.body, this);
  return this;
};

MIME.prototype.getHeader = function(name){
  const low = x => x.toLowerCase();
  return this.headers.find(x => low(x.name) === low(name));
};

/**
 * toString
*/
MIME.prototype.toString = function(){
  const { headers, body } = this;
  var message = [], boundary;
  if(Array.isArray(body)){
    boundary = (Math.random() + Date.now()).toString(36);
    this.addHeader('Content-Type', 'multipart/alternative', {
      boundary
    });
  }
  headers.forEach(header => 
      message.push(header.toString()));
  message.push(null);
  if(boundary){
    body.forEach(part => {
      message.push('--' + boundary);
      message.push(part.toString());
      message.push(null);
    });
    message.push('--' + boundary + '--');
  }else{
    message.push(body);
  }
  message.push(null);
  return message.join(MIME.CRLF);
};

/**
 * [parse description]
 * @param  {[type]} content     [description]
 * @param  {[type]} contentType [description]
 * @return {[type]}             [description]
 */
MIME.parse = function(content, contentType){
  var mime = new MIME();
  if(typeof contentType === 'undefined'){
    return mime.end(content);
  }else{
    return MIME.parseBody(content, contentType);
  }
};

/**
 * [parseAddress description]
 * @docs https://tools.ietf.org/html/rfc2822#section-3.4
 * @param  {[type]} address [description]
 * @return {[type]}         [description]
 */
MIME.parseAddress = function(address){
  const r1 = /(.+)@(.+)/;
  const r2 = /^([^<]+)?<(.+)@(.+)>$/;
  if(typeof address !== 'string') 
    throw new TypeError(`[MIME] address must be a string, but got ${address}`);
  if(!r1.test(address))
    throw new SyntaxError(`[MIME] address syntax error: ${address}`);
  var _, name, user, host;
  if(r2.test(address)){
    // Liu song <hi@lsong.org>
    [ _, name, user, host ] = address.match(r2);
  }else{
    // hi@lsong.org
    [ _, user, host ] = address.match(r1);
  }
  host = host.trim();
  user = user.trim();
  name = (name || '').trim();
  return {
    host,
    user,
    name,
    address: `${user}@${host}`,
    toString(){
      name = name ? `"${name}"` : name;
      return `${name}<${this.address}>`;
    }
  };
};
/**
 * [parseHeaders description]
 * @param  {[type]} header [description]
 * @return {[type]}        [description]
 */
MIME.parseHeaders = function(header){
  return header
  .replace(/\n\s+/g, '')
  .split(MIME.CRLF)
  .filter(MIME.filter)
  .map(Header.parse);
};

module.exports = MIME;