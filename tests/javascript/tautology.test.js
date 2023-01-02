/**
 * @jest-environment jsdom
 */

test('of jsdom',()=>{
  const element = document.createElement('div');
  expect(element).not.toBeNull();
});

test('require',()=>{
    
    // Workaround bug https://github.com/inrupt/solid-client-authn-js/issues/1676#issuecomment-1276477404
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

    //Deliberately created as implicit global 
    // d3 = require("d3");
    var jsdom = require("jsdom");
    const { JSDOM } = jsdom;
    const { window } = new JSDOM();
    const { document } = (
        new JSDOM(
            '<div id="showPrefVoteViz"></div><div id="showError"></div>', 
            { url: 'https://example.org/',
            }
        )
    ).window ;
    expect(document).toBeDefined();
    global.window = document;
    global.document = document;
    
    
    const $ = global.jQuery = require( "jQuery");
    
    
    
    jQueryDoc = jQuery(document);
    jQueryWin = jQuery(window);
    let aResult = jQuery.grep( ['a','b','c'], function(x) { return x == 'c' ;} );
    expect( typeof aResult ).toBe('object');
    expect( aResult[0] ).toBe('c');
    expect(jQueryDoc.find('#showPrefVoteViz').length).toBe(1);
    //expect(jQuery('#showPrefVoteViz').length).toBe(1);
    
});
    