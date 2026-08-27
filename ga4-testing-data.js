/**----------------------------------------------------------------------------
 * Fixture data for the GA4 handler test page
 *
 * The random path gives us suitably-shaped noise to throw at the handler, and
 * the static path gives us the original known fixture data to compare against.
 *---------------------------------------------------------------------------*/

/**
 * Fetch the requested fixture mode from the page
 *
 * Query string wins first, then local storage, then random as a sane default.
 *
 * @returns {string}	The fixture mode to use
 */
function getFixtureMode() {
	if ( typeof window === 'undefined' ) {
		return 'random';
	}

	let requestedMode = null;

	if ( window.location && window.location.search ) {
		let searchParams = new URLSearchParams( window.location.search );
		requestedMode = searchParams.get( 'fixture' );
	}

	if ( requestedMode === 'static' || requestedMode === 'random' ) {
		setStoredFixtureMode( requestedMode );

		return requestedMode;
	}

	return getStoredFixtureMode() || 'random';
}

/**
 * Pull the stored fixture mode, if the browser will let us
 *
 * @returns {string|null}	The stored fixture mode, or nothing usable
 */
function getStoredFixtureMode() {
	try {
		if ( window.localStorage ) {
			return window.localStorage.getItem( 'ga4FixtureMode' ); // The last user-selected fixture path
		}
	}
	catch ( error ) {
		console.debug( error ); // Storage being unavailable should not break the fixture page
	}

	return null;
}

/**
 * Store the fixture mode so the next page load holds the same state
 *
 * @param {string} fixtureMode	The fixture mode to remember
 */
function setStoredFixtureMode( fixtureMode ) {
	try {
		if ( window.localStorage ) {
			window.localStorage.setItem( 'ga4FixtureMode', fixtureMode );
		}
	}
	catch ( error ) {
		console.debug( error ); // Storage being unavailable should not break the fixture page
	}
}

/**
 * Return a random whole number within a range
 *
 * @param {number} min	The smallest number we will allow
 * @param {number} max	The largest number we will allow
 * @returns {number}
 */
function randomInteger( min, max ) {
	return Math.floor( Math.random() * ( max - min + 1 ) ) + min;
}

/**
 * Return a random boolean
 *
 * @returns {boolean}
 */
function randomBoolean() {
	return Math.random() >= 0.5;
}

/**
 * Pick a random value from a defined list
 *
 * @param {Array} values	The values to pick from
 * @returns {*}
 */
function randomChoice( values ) {
	return values[randomInteger( 0, values.length - 1 )];
}

/**
 * Generate a random money-ish value and keep it to cents
 *
 * @param {number} min	The smallest amount we will allow
 * @param {number} max	The largest amount we will allow
 * @returns {number}
 */
function randomMoney( min, max ) {
	return Math.round( ( Math.random() * ( max - min ) + min ) * 100 ) / 100;
}

/**
 * Generate a throwaway string token for IDs/coupons
 *
 * @param {string} prefix	The prefix used to keep the token recognisable
 * @returns {string}
 */
function randomToken( prefix ) {
	return prefix + randomInteger( 100000, 999999 ) + randomInteger( 100000, 999999 );
}

/**
 * Generate a UUID-looking value for user IDs
 *
 * @returns {string}
 */
function randomUuid() {
	if ( typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ) {
		return crypto.randomUUID();
	}

	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, function( char ) {
		let rand = randomInteger( 0, 15 );
		let value = char === 'x' ? rand : ( rand & 0x3 ) | 0x8;

		return value.toString( 16 );
	} );
}

/**
 * Generate a product object with the fields the handler expects
 *
 * @param {string} prefix	The label prefix so we can tell fixture types apart
 * @returns {object}
 */
function randomProduct( prefix ) {
	return {
		id : randomInteger( 100, 9999 ), // Product ID
		name : prefix + ' ' + randomChoice( [
			'Starter Pack',
			'Router Credit',
			'Speed Boost',
			'Data Top Up',
			'Service Credit'
		] ), // Product name
		price : randomMoney( 5, 250 ), // Product price
		qty : randomInteger( 1, 5 ), // Quantity added to the cart
		coupon : randomBoolean() ? randomToken( 'coupon-' ) : null // Coupon applied, or not
	};
}

/**
 * Generate a cart with one or more random products
 *
 * @returns {Array<object>}
 */
function randomCart() {
	let cartItems = [];
	let cartLength = randomInteger( 1, 4 );

	for ( let itemIndex = 0; itemIndex < cartLength; itemIndex++ ) {
		cartItems.push( randomProduct( 'Cart Item ' + ( itemIndex + 1 ) ) );
	}

	return cartItems;
}

/**
 * Build a randomised set of page globals that match the handler contracts
 *
 * @returns {object}
 */
function buildRandomFixture() {
	let randomUserId = randomUuid();

	return {
		user : {
			id : randomUserId, // The value that should be SHA'd by the handler
			user_account_bal : randomMoney( 0, 500 ), // User balance before the event
			auto_recharge_method : randomChoice( [
				'card',
				'payid',
				'bank_transfer'
			] ), // User's auto recharge method
			autoRecharge_value : randomMoney( 10, 100 ), // The value used for auto recharge
			shopping_cart : randomCart(), // The user's current shopping cart
			order : {
				transaction_id : randomToken( 'txn-' ), // The order reference
				coupon : randomBoolean() ? randomToken( 'order-coupon-' ) : null // Order-level coupon
			}
		},
		product : randomProduct( 'Product' ), // Product used by single-product events
		account : {
			residential : {
				user : {
					id : randomUserId // Mirror the user ID shape used by older page loaders
				}
			}
		},
		service : {
			loc_id : randomToken( 'LOC' ), // The service LOC ID
			poi : randomInteger( 1000, 9999 ), // The POI the service is connected through
			avc : randomToken( 'AVC' ), // The service AVC
			plan_id : randomInteger( 1, 99 ), // The internal plan ID
			plan : randomChoice( [
				'Starter',
				'Fast',
				'Fast Plus',
				'Business',
				'Enterprise'
			] ), // The plan name
			price : randomMoney( 50, 300 ) // The service price
		},
		datapack : randomProduct( 'Data Pack' ), // Product shape for the data pack path
		notification_level : { value : randomInteger( 1, 5 ) }, // Notification verbosity
		balance_notify_output : { value : randomInteger( 1, 30 ) }, // Days before low balance notice
		referbycode : { value : randomToken( 'ref-' ) }, // Referral code input shape
		paymentMethod : { ppid : randomToken( 'ppid-' ) } // Payment method input shape
	};
}

/**
 * Build the original static fixture data from the archived test file
 *
 * @returns {object}
 */
function buildStaticFixture() {
	return {
		user : {
			id : 777, // The value that should be SHA'd by the handler
			user_account_bal : 55.55, // User balance before the event
			auto_recharge_method : 'payid', // User's auto recharge method
			autoRecharge_value : 25, // The value used for auto recharge
			shopping_cart : [
				{
					id : 123, // Product ID
					name : 'Hi there I am 123', // Product name
					price : 12.34, // Product price
					qty : 3, // Quantity added to the cart
					coupon : 'no' // Coupon applied
				}
			],
			order : {
				transaction_id : '123456789A', // The order reference
				coupon : 'lolhai' // Order-level coupon
			}
		},
		product : {
			id : 456, // Product ID
			name : 'Hi there I am 456!', // Product name
			price : 77.77, // Product price
			qty : 1, // Quantity added to the cart
			coupon : null // Coupon applied, or not
		},
		account : {
			residential : {
				user : {
					id : 777 // Mirror the user ID shape used by older page loaders
				}
			}
		},
		service : {
			loc_id : 'NBN385478200845802480', // The service LOC ID
			poi : 12333, // The POI the service is connected through
			avc : 'AVC48043258953498', // The service AVC
			plan_id : 33, // The internal plan ID
			plan : 'Fast', // The plan name
			price : 7.00 // The service price
		},
		datapack : {
			id : 777, // Product ID
			name : 'I AM DATAPACK', // Product name
			price : 77.77, // Product price
			qty : 3, // Quantity added to the cart
			coupon : 'readyforthefloor' // Coupon applied
		},
		notification_level : { value : 5 }, // Notification verbosity
		balance_notify_output : { value : 5 }, // Days before low balance notice
		referbycode : { value : 'lol' }, // Referral code input shape
		paymentMethod : { ppid : '5789587952479' } // Payment method input shape
	};
}

// Decide which fixture set we should put onto the page
let fixtureMode = getFixtureMode();

// Build the requested fixture data before assigning globals
let fixtureData = fixtureMode === 'static'
	? buildStaticFixture()
	: buildRandomFixture();

// Emit globals that match the old page loading behaviour the handler expected
let user = fixtureData.user;
let product = fixtureData.product;
let account = fixtureData.account;
let service = fixtureData.service;
let datapack = fixtureData.datapack;
let notification_level = fixtureData.notification_level;
let balance_notify_output = fixtureData.balance_notify_output;
let referbycode = fixtureData.referbycode;
let paymentMethod = fixtureData.paymentMethod;

if ( typeof window !== 'undefined' ) {
	window.ga4FixtureMode = fixtureMode; // Let the test page display which path was used
}
