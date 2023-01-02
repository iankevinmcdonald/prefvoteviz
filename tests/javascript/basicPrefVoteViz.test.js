/**
 * @jest-environment jsdom
 */

// Some of this will go into a config file pointed to by setupFilesAfterEnv: 
// Need to import D3 and jQuery 
// $ = require("https://ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.js");

// Workaround bug https://github.com/inrupt/solid-client-authn-js/issues/1676#issuecomment-1276477404
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

var jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { window } = new JSDOM();

// Needs some setup

//Deliberately created as implicit global 
PrefVoteVizBaseView = require( "../../javascript/PrefVoteVizBaseView.js" );
PrefVoteVizDoughnut = require( "../../javascript/PrefVoteVizDoughnut.js" );
PrefVoteVizControl = require("../../javascript/PrefVoteVizControl.js");

test('of jsdom',()=>{
  const element = document.createElement('div');
  expect(element).not.toBeNull();
});

test('of opaVoteTechBnDemo', async ()=> {
    const { document } = (
        new JSDOM(
            '<div id="showPrefVoteViz"></div><div id="showError"></div>', 
            { url: 'https://example.org/',
              innerWidth: 960
            }
        )
    ).window ;
    global.document = document ;
    let opavoteTechBnDemo = require("../data/opavoteTechBnDemo.json");
    expect( opavoteTechBnDemo.status ).toBe('success');
    $ = jQuery = require('jquery');
    // Jest cannot cope with non-minimised D3; see https://github.com/facebook/jest/issues/12036
    d3 = require("../../node_modules/d3/dist/d3.min.js");
    expect( $ ).toBeDefined();
    //expect( typeof($) ).toBe( 'function' );
    let $target = $(document).find('#showPrefVoteViz');
    expect( $target.length ).toBe(1);
    let testViz = new PrefVoteVizControl( { data: opavoteTechBnDemo.data, viewClass: 'PrefVoteVizDoughnut', tick: 0.01 }, $target);
    expect ( testViz ).toBeDefined();
    expect ( $target.find('path.seat.vacant').length ).toBe(2);
    expect( $target.find('path.count').length).toBe(5);
    expect($target.find('text.count.label.candidate_1').text() ).toBe('Elon Musk');
    expect($target.find('svg')).toMatchSnapshot();
    let promise = testViz.step();
    await promise;
    
    expect( $target.find('path.count').length).toBe(4);
    // then 3, then 2 (but path.seat.vacant no more)
    await testViz.step();
    expect( $target.find('path.count').length).toBe(3);
    await testViz.step();
    expect( $target.find('path.count').length).toBe(2);
    expect ( $target.find('path.elected').length ).toBe(1);
    await testViz.step();
    expect( $target.find('path.count').length).toBe(0);
    expect ( $target.find('path.elected').length ).toBe(2);
    expect($target.find('text.elected.candidate_2').text()).toBe('Bill Gates');
    expect($target.find('text.elected.candidate_0').text()).toBe('Steve Jobs');
    
    
});
