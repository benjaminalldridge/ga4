/**----------------------------------------------------------------------------
 * Handle Google Analytics V4 events
 * 
 * Sets the user ID to SHA-256 to comply with GA4 user TOS while allowing fing-
 * erprinting against our own records. SHA sum can be calculated on the server-
 * side if necessary to obfuscate PII further.
 * 
 * SHA crypto function taken from MDN reference: 
 * @link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 *---------------------------------------------------------------------------*/

/**
 * GA4 handling is achieved via the dataLayer methodology, a-la Tag Manager
 * 
 * If the window.dataLayer prototype isn't available, default to using an empty
 * array in its place to be observed
 */
const ga4Window = typeof window !== 'undefined' ? window : globalThis;

// Set up the dataLayer for GA4 to use, or default to an empty array if it doesn't exist
ga4Window.dataLayer = ga4Window.dataLayer || [];

// Set up a placeholder for fields which may change over the page lifetime
let fieldsChanged = {};

// Set up a holder for execution tracing, if the page has asked for it
let executionPath = [];

/**
 * Reset the execution path so a new action can be traced cleanly
 * 
 * @param {string|undefined} entryPoint	The public function we are starting from
 */
function beginExecutionPath( entryPoint ) {
	executionPath = [];

	if ( entryPoint ) {
		traceExecution( entryPoint );
	}
}

/**
 * Append the current function to the execution path if tracing is enabled
 * 
 * @param {string} functionName	The function currently being traversed
 */
function traceExecution( functionName ) {
	if ( ga4Window.ga4TraceEnabled ) {
		executionPath.push( functionName );
	}
}

/**
 * Return the current execution path without letting callers mutate it
 * 
 * @returns {Array<string>}
 */
function getExecutionPath() {
	return executionPath.slice();
}

ga4Window.ga4BeginExecutionPath = beginExecutionPath;
ga4Window.ga4GetExecutionPath = getExecutionPath;

/** 
 * Crypto function to encode as SHA-256 taken from MDN
 * 
 * @link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 */
async function digestMessage( message ) {
	const msgUint8 = new TextEncoder().encode( String( message ) ); // encode as (utf-8) Uint8Array
	const hashBuffer = await crypto.subtle.digest( 'SHA-256', msgUint8 ); // hash the message
	const hashArray = Array.from( new Uint8Array( hashBuffer ) ); // convert buffer to byte array
	const hashHex = hashArray.map( ( b ) => b.toString( 16 ).padStart( 2, '0' ) ).join( '' ); // convert bytes to hex string
	return hashHex;
}

/**
 * The list of event names with the required data scaffolded internally
 * 
 * Each event defines if it's an ecommerce event, and which builder should be
 * invoked to get the right-shaped data for that event. If it is an ecomm event
 * then return an ecommerce-shaped object, otherwise it should return an object 
 * with only the bare minimum of data required to emit the event.
 * 
 * The contract object declares the public shape of each event so the registry
 * is also our source of truth for what must be handed to the builder.
 */
const eventRegistry = {

	// The user has clicked on a shop item
	view_item : {
		contract : buildEventContract( 'view_item', [ 'product' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildProductEvent( data.product );
		}
	},

	// The user has added an item to their cart
	add_to_cart : {
		contract : buildEventContract( 'add_to_cart', [ 'product' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildProductEvent( data.product );
		}
	},

	// The user has removed an item from their cart
	remove_from_cart : {
		contract : buildEventContract( 'remove_from_cart', [ 'product' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildProductEvent( data.product );
		}
	},

	// The user is adding a data pack to their account
	purchase_data_pack : {
		contract : buildEventContract( 'purchase_data_pack', [ 'product' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildProductEvent( data.product );
		}
	},

	// The user has started the checkout process
	begin_checkout : {
		contract : buildEventContract( 'begin_checkout', [ 'user' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildCheckoutEvent( data.user );
		}
	},

	// The user has completed the checkout process
	purchase : {
		contract : buildEventContract( 'purchase', [ 'user' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildCheckoutEvent( data.user );
		}
	},

	// The user is trying to recharge
	recharge : {
		contract : buildEventContract( 'recharge', [ 'product' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildProductEvent( data.product );
		}
	},

	// The user has added their payment info
	add_payment_info : {
		contract : buildEventContract( 'add_payment_info', [ 'paymentMethod' ] ),
		ecommerce : true,
		build : function( data ) {
			return buildPaymentMethod( data.paymentMethod );
		}
	},

	// The user is trying to add a new service
	add_service : {
		contract : buildEventContract( 'add_service', [ 'service', 'user' ] ),
		ecommerce : false,
		build : function( data ) {
			return {
				service : buildServiceItem( data.service ), // Tell us about the service
				starting_balance : data.user.user_account_bal // The starting balance of the user's account
			};
		}
	},

	// The user is viewing their established services
	view_services : buildEmptyEvent( 'view_services' ),

	// The user is attempting to log in
	login : buildEmptyEvent( 'login' ),

	// The user is attempting to log out
	logout : buildEmptyEvent( 'logout' ),

	// The user is attempting to reset their password
	password_reset : buildEmptyEvent( 'password_reset' ),

	// The user is checking the various service statuses across various data views
	view_status : {
		contract : buildEventContract( 'view_status', [ 'statusType' ] ),
		ecommerce : false, // This isn't ecomm, we don't need products
		
		// We do need the data underneath the event however
		build : function( data ) {
			return {
				status_type : data.statusType // What's the type of status we are viewing?
			};
		}
	},

	// The user is inspecting their usage history
	view_usage : {
		contract : buildEventContract( 'view_usage' ),
		ecommerce : false,
		build : function( data ) {
			return {
				filtering_method : data.method ?? 'None' // The type of filter we are using
			};
		}
	},

	// Databank is obsolete, but we still need to track it for historical purposes
	view_databank : buildEmptyEvent( 'view_databank' ),

	// The user is interrogating their past transactions
	view_transactions : {
		contract : buildEventContract( 'view_transactions', [ 'filtered' ] ),
		ecommerce : false, // Not an ecomm function!

		// We still need to know how the list is being handled
		build : function( data ) {
			return {
				filtered : data.filtered, // Are we filtering the list?
				exported : data.exported ?? false // Are we exporting the list?
			};
		}
	},

	// Only admin users can do this, so we don't need to know anything about the user
	add_transaction : buildEmptyEvent( 'add_transaction' ),

	// The user is asking for a new AVC from their connection provider
	request_reprovision : buildEmptyEvent( 'request_reprovision' ),

	// The user is asking for an internal IPv4 change from our servers
	request_ipv4_change : buildEmptyEvent( 'request_ipv4_change' ),

	// The user is adding an IPv4 PTR record to their service
	add_ipv4_ptr : buildEmptyEvent( 'add_ipv4_ptr' ),

	// The user is viewing the full manifest of their connection info
	view_advanced_cxn : buildEmptyEvent( 'view_advanced_cxn' ),

	// We are viewing the Critical Information Summary
	view_cis : buildEmptyEvent( 'view_cis' ),

	// The user is attempting to modify their connection type
	modify_service : {
		contract : buildEventContract( 'modify_service', [ 'service' ] ),
		ecommerce : false, // This isn't ecomm, despite feeling like it

		// The service particulars are very important here
		build : function( data ) {
			return {
				service : buildServiceItem( data.service ) // Tell us about the service
			};
		}
	},

	// The user is pausing their service which has cost implications to us
	pause_service : {
		contract : buildEventContract( 'pause_service', [ 'service', 'paused' ] ),
		ecommerce : false, // Also not ecomm, despite feeling like it

		// The service information helps us determine costings long-term
		build : function( data ) {
			return {
				service : buildServiceItem( data.service ), // Tell us about the service
				service_paused : data.paused // Pass in the boolean value for pausing
			};
		}
	},

	// The user is trying to disconnect their service which has cost implications
	disconnect_service : {
		contract : buildEventContract( 'disconnect_service', [ 'service' ] ),
		ecommerce : false, // Not ecomm, maybe should be

		// We need to know about the service for future benchmarking
		build : function( data ) {
			return {
				service : buildServiceItem( data.service ) // The service item
			};
		}
	},

	// The user is trying to transfer their active AVC to another user
	transfer_service : {
		contract : buildEventContract( 'transfer_service', [ 'service' ] ),
		ecommerce : false, // Not ecomm!

		// What service is it? This also helps future costings
		build : function( data ) {
			return {
				service : buildServiceItem( data.service ) // The service item
			};
		}
	},

	// The user has made orders previously and is inspecting them
	view_orders : {
		contract : buildEventContract( 'view_orders', [ 'filtered' ] ),
		ecommerce : false, // Not ecomm, even though it sort of is

		// Set up the data about how the list is being used
		build : function( data ) {
			return {
				filtered : data.filtered // Are we filtering the list?
			};
		}
	},

	// Check out the user's assigned IP addresses
	view_ip_addresses : buildEmptyEvent( 'view_ip_addresses' ),

	// The user is trying to change their auto-recharge particulars
	modify_auto_recharge : {
		contract : buildEventContract( 'modify_auto_recharge', [ 'enabled', 'user' ] ),
		ecommerce : false, // This could've been ecomm, but this shape is easier to live with

		// Tell us how the auto recharge is being changed and what to
		build : function( data ) {
			return {
				auto_recharge : data.enabled, // Pass in the boolean value
				auto_recharge_method : data.user.auto_recharge_method ?? 'None', // What method they're using
				auto_recharge_value : data.user.autoRecharge_value ?? 0 // What value will trigger a recharge
			};
		}
	},

	// The user is checking out their extant payment info
	view_payment_info : buildEmptyEvent( 'view_payment_info' ),

	// The user is removing their extant payment info
	remove_payment_info : buildEmptyEvent( 'remove_payment_info' ),

	// The user is interrogating their past referrals
	view_referrals : buildEmptyEvent( 'view_referrals' ),

	// The user is attempting to modify their user account
	modify_account : {
		contract : buildEventContract( 'modify_account' ),
		ecommerce : false, // Not here either

		// Have the fields mutated? If so, lodge how they've changed
		build : function( data ) {

			// They haven't, so we don't need to bubble up anything
			if ( !data.fieldsChanged ) {
				return {};
			}

			// They have, so surface how and what has mutated
			return {
				fields_changed : data.fieldsChanged // A list of the fields changed
			};
		}
	},

	// The user is attempting to modify how and what low balance notices are used
	modify_low_balance_notif : {
		contract : buildEventContract( 'modify_low_balance_notif', [ 'balanceNotifyOutput', 'notificationLevel' ] ),
		ecommerce : false, // Not a purchase!

		// Build out the data about what notifications the user has requested
		build : function( data ) {
			return {
				notification_period : data.balanceNotifyOutput.value, // How many days until notification
				notification_level : data.notificationLevel.value // The level of notifications to send
			};
		}
	},

	// The user is adding a referral code to their account
	add_referral_code : {
		contract : buildEventContract( 'add_referral_code', [ 'referByCode' ] ),
		ecommerce : false, // Not ecomm

		// Prop up the referral code the user has asked for
		// NB: this MAY have PII implications
		build : function( data ) {
			return {
				referral_code : data.referByCode.value // The code of the referral code
			};
		}
	},

	// The user has requested their referral code have a static link to share
	request_referral_link : buildEmptyEvent( 'request_referral_link' ),

	// The user is trying to modify their account's link to their FB for login
	facebook_link : {
		contract : buildEventContract( 'facebook_link', [ 'unlink' ] ),
		ecommerce : false, // Not ecommerce

		// Are we trying to join our accounts together? Or separate them?
		build : function( data ) {
			return {
				linked : data.unlink // Are we unlinking this?
			};
		}
	},

	// The user is trying to submit a BTC payment through the middleware
	spend_virtual_currency : {
		contract : buildEventContract( 'spend_virtual_currency', [ 'product' ] ),
		ecommerce : false, // Very definitely ecomm, but can't be tracked as such

		// The particulars of the VC payment are potentially PII, investigate later
		build : function( data ) {
			return {
				value : data.product.price, // The price of the transaction
				virtual_currency_name : 'Bitcoin', // We only accept BTC currently
				item_name : data.product.name, // What product was it?
				item_id : data.product.id // Give the ID so we can coalese later
			};
		}
	},

	// The user is lodging a pay ID payment request
	pay_id_payment : buildEmptyEvent( 'pay_id_payment' )
};

/**
 * Ingest user ID and SHA it using the MDN method above
 * 
 * NB: Wanted this in the payload generator, but async timing here is awkward
 */
function resolveInitialUserId() {
	// If the page emitted a userId already, we should use that in preference
	if ( typeof ga4Window.userId !== 'undefined' && ga4Window.userId !== null ) {
		return ga4Window.userId;
	}

	// If an older loader has already established userId, that still counts
	if ( typeof userId !== 'undefined' && userId !== null ) {
		return userId; // We know the user ID, so it is safe to send back
	}

	// If we don't have anything usable yet, wait until the SHA process finishes
	return null;
}

// Set up prop for user ID to wait
let resolvedUserId = resolveInitialUserId();

// We aren't waiting, unless we are
let userIdPending = false;

// Set up a tracker for GA4 to use across the handler
const ga4Tracker = createGa4Tracker( {

	// Expose the dataLayer for use in the tracker
	dataLayer : ga4Window.dataLayer,

	// Expose the user ID for use in the tracker
	getUserId : function() {
		return resolvedUserId; // The user ID, or null if it's still pending
	},

	// Expose the user ID pending status for use in the tracker
	isUserIdPending : function() {
		return userIdPending; // Are we pending user ID resolution?
	}
} );

if ( resolvedUserId === null && typeof user !== 'undefined' && user.id ) {
	userIdPending = true;

	// Build a user ID if the page didn't already give us a usable one
	digestMessage( user.id )
		.then( function( digestHex ) {
			resolvedUserId = digestHex;
			userIdPending = false;
			ga4Tracker.flush();
		} )
		.catch( function( error ) {
			userIdPending = false;
			console.error( error );
			ga4Tracker.flush();
		} );
}

/**
 * The user has clicked on a shop item
 */
function viewItem() {  
	
	// Push the data to the data layer
	handleEvent( 'view_item', { 
		product : product // What product are we viewing?
	} );
}

/**
 * The user has added an item to their cart
 */
function addToCart() {    

	// Push the data to the data layer
	handleEvent( 'add_to_cart', { 
		product : product // What product are we adding?
	} );
}

/**
 * The user has removed an item from their cart
 */
function removeFromCart() {    

	// Push the data to the data layer
	handleEvent( 'remove_from_cart', { 
		product : product // What product are we removing?
	} );
}

/**
 * The user is adding a data pack to their account
 */
function purchaseDatapack() {

	// Push the data to the data layer
	handleEvent( 'purchase_data_pack', { 
		product : datapack // What datapack are we purchasing?
	} );
}

/**
 * A generic method to handle checkout commencement or completion
 * 
 * @param {boolean} complete 	Define if the checkout is completed or not
 */
function checkout( complete ) {    

	// Define the name of our event
	let eventName;

	// Negotiate which way to branch
	switch ( complete ) {

		// Switch on whether the checkout is complete or not
		case true:
			eventName = 'purchase'; // This is a purchase event
		break;

		// If not, we need to begin the process
		case false:
		default:
			eventName = 'begin_checkout'; // This is a checkout begin event
			break;
	}
	
	// Push the data to the data layer
	handleEvent( eventName, { 
		user : user // Tell us about the user
	} );
}

/**
 * The user is trying to recharge
 */
function recharge() {

	// Push the data to the data layer
	handleEvent( 'recharge', { 
		product : product // What product are we recharging?
	} );
}

/**
 * The user is trying to add a new service
 */
function addService() {

	// Push the data to the data layer
	handleEvent( 'add_service', { 
		service : service, // What service are we adding?
		user : user // The user is... who?
	} );
}

/**
 * The user is trying to view their services
 */
function viewServices() {

	// Push the data to the data layer
	handleEvent( 'view_services' );
}

/**
 * The user is logging in
 */
function userLogin() {

	// Push the data to the data layer
	handleEvent( 'login' );
}

/**
 * The user is logging out
 */
function userLogout() {

	// Push the data to the data layer
	handleEvent( 'logout' );
}

/**
 * The user is resetting their password
 */
function passwordReset() {

	// Push the data to the data layer
	handleEvent( 'password_reset' );
}

/**
 * The user is checking the service status
 * 
 * @param {string} statusType	The type of status we are viewing
 * 								 (LOC, CVC, POI, postcode, router)
 */
function viewStatus( statusType ) {

	// Push the data to the data layer
	handleEvent( 'view_status', { 
		statusType : statusType // What type of status are we viewing?
	} );
}

/**
 * The user is viewing their usage status
 * 
 * @param {string} method 	The method the user is using for navigation
 */
function viewUsage( method ) {

	// Push the data to the data layer
	handleEvent( 'view_usage', { 
		method : method // What method is the user using for navigation?
	} );
}

/**
 * The user is checking their databank status
 */
function viewDatabank() {

	// Push the data to the data layer
	handleEvent( 'view_databank' );
}

/**
 * The user is checking their transaction history
 * 
 * @param {boolean} filtered 	Is the list filtered?
 * @param {boolean} exported 	Is the list being exported?
 */
function viewTransactions( filtered, exported ) {

	// Push the data to the data layer
	handleEvent( 'view_transactions', { 
		filtered : filtered, // Are we viewing a filtered list?
		exported : exported // Are we exporting the list?
	} );
}

/**
 * The user is adding a transaction history
 */
function addTransaction() {

	// Push the data to the data layer
	handleEvent( 'add_transaction' );
}

/**
 * The user has requested an AVC reprovision
 */
function requestReprovision() {

	// Push the data to the data layer
	handleEvent( 'request_reprovision' );
}

/**
 * The user has requested an IPv4 address change
 */
function requestIPv4AddressChange() {

	// Push the data to the data layer
	handleEvent( 'request_ipv4_change' );
}

/**
 * The user has added an IPv4 PTR
 */
function addIPv4PTR() {

	// Push the data to the data layer
	handleEvent( 'add_ipv4_ptr' );
}

/**
 * The user has shown advanced connection info
 */
function viewAdvancedCxnInfo() {

	// Push the data to the data layer
	handleEvent( 'view_advanced_cxn' );
}

/**
 * The user has clicked the Critical Information Summary
 */
function viewCIS() {

	// Push the data to the data layer
	handleEvent( 'view_cis' );
}

/**
 * The user has modified their service
 */
function modifyService() {

	// Push the data to the data layer
	handleEvent( 'modify_service', { service : service } );
}

/**
 * The user has toggled pause on their service
 * 
 * @param {boolean} paused		If the service is paused or not
 */
function pauseService( paused ) {
	
	// Push the data to the data layer
	handleEvent( 'pause_service', { 
		service : service, // What service are we pausing?
		paused : paused // Is it actually paused, or being unpaused?
	} );
}

/**
 * The user has disconnected their service
 */
function disconnectService() {

	// Push the data to the data layer
	handleEvent( 'disconnect_service', { service : service } );
}

/**
 * The user has transferred their service
 */
function transferService() {

	// Push the data to the data layer
	handleEvent( 'transfer_service', { service : service } );
}

/**
 * The user is viewing their order history
 * 
 * @param {boolean} filtered 	Is the list filtered? 
 */
function viewOrderHistory( filtered ) {

	// Push the data to the data layer
	handleEvent( 'view_orders', { 
		filtered : filtered // Are we viewing a filtered list?
	} );
}

/**
 * The user is viewing their IP addresses
 */
function viewIPAddresses() {

	// Push the data to the data layer
	handleEvent( 'view_ip_addresses' );
}

/**
 * The user has disabled auto recharge
 * 
 * @param {boolean} enabled		If auto recharge is enabled
 */
function autoRecharge( enabled ) {

	// Push the data to the data layer
	handleEvent( 'modify_auto_recharge', { 
		enabled : enabled, // Is auto recharge enabled?
		user : user // Who is the user?
	} );
}

/**
 * The user is viewing their payment details
 */
function viewPaymentInfo() {

	// Push the data to the data layer
	handleEvent( 'view_payment_info' );
}

/**
 * The user has added their payment info
 */
function addPaymentInfo() {

	// Push the data to the data layer
	handleEvent( 'add_payment_info', { 
		paymentMethod : paymentMethod // What kind of payment is this?
	} );
}

/**
 * The user has removed their payment info
 */
function removePaymentInfo() {

	// Push the data to the data layer
	handleEvent( 'remove_payment_info' );
}

/**
 * The user is viewing their referrals
 */
function viewReferrals() {

	// Push the data to the data layer
	handleEvent( 'view_referrals' );
}

/**
 * The user is managing account details
 */
function manageAccountDetails() {

	// Push the data to the data layer
	handleEvent( 'modify_account' );
}

/**
 * The user has changed their low balance notification settings
 */
function modifyLowBalanceNotification() {

	// Honour the page globals if they've been emitted, otherwise use neutral fallbacks
	let balanceNotifyOutput = typeof balance_notify_output !== 'undefined'
		? balance_notify_output
		: { value : 0 };

	let notificationLevel = typeof notification_level !== 'undefined'
		? notification_level
		: { value : 0 };

	// Push the data to the data layer
	handleEvent( 'modify_low_balance_notif', {
		balanceNotifyOutput : balanceNotifyOutput, // How many days until notification
		notificationLevel : notificationLevel // The verbosity of notifications to send
	} );
}

/**
 * The user has entered a referral code
 */
function addReferralCode() {

	// Push the data to the data layer
	handleEvent( 'add_referral_code', { referByCode : referbycode } );
}

/**
 * The user has requested a referral link
 */
function requestReferralLink() {

	// Push the data to the data layer
	handleEvent( 'request_referral_link' );
}

/**
 * The user has unlinked their account from Facebook
 * 
 * @param {boolean} unlink 	If the user is unlinking their account from Facebook
 */
function linkToFacebook( unlink ) {

	// Push the data to the data layer
	handleEvent( 'facebook_link', { unlink : unlink } );
}

/**
 * The user has updated their account details
 */
function modifyAccountDetails() {

	// Push the data to the data layer
	handleEvent( 'modify_account', { fieldsChanged : fieldsChanged } );
}

/**
 * The user has submitted a Bitcoin payment
 */
function bitcoinPayment() {

	// Push the data to the data layer
	handleEvent( 'spend_virtual_currency', { product : product } );
}

/**
 * The user has submitted a PayID payment
 */
function payIdPayment() {

	// Push the data to the data layer
	handleEvent( 'pay_id_payment' );
}

/**
 * A method to handle testing link between the client layer and GA4/GTM
 */
function syncTest() {
	
	// Push the data to the data layer
	handleEvent( 'login' );

}

/**
 * A generic method to handle an event by name and its required data
 * 
 * @param {string} eventName			The name of the event
 * @param {object|undefined} eventData	Any required data we wish to scaffold
 * @returns {boolean}					Have we actually handled the event?
 */
function handleEvent( eventName, eventData ) {
	traceExecution( 'handleEvent()' );

	// Set up a tracker using the event's name/data to observe how it mutates
	return ga4Tracker.track( eventName, eventData || {} );
}

/**
 * Construct a single tracker factory for use across the handler
 * 
 * @param {object} options 	The options used to build the tracker
 * @returns {object}		The tracker used to handle and emit events
 */
function createGa4Tracker( options ) {
	traceExecution( 'createGa4Tracker()' );

	// The layer where our data lives
	const dataLayer = options.dataLayer 
		|| ga4Window.dataLayer;

	// Who is the user?
	const getUserId = options.getUserId;
	
	// Is the user ID pending being filled?
	const isUserIdPending = options.isUserIdPending || function() { 
		return false;
	}; 

	// Is anything pending for us?
	const pendingPayloads = [];	// What payloads are waiting for resolution?

	/**
	 * Actually push the data structure into the dataLayer for GA4 to consume
	 * 
	 * @param {string} eventName						The name of the event
	 * @param {boolean} eCommerce						Is this an ecommerce event?
	 * @param {object|undefined} additionalDataObj	Any additional data we need to propagate
	 */
	function pushPayload( eventName, eCommerce, additionalDataObj ) {
		traceExecution( 'pushPayload()' );

		// Build the basic structure for the payload
		let dataStructure = buildPayloadStructure( eventName, getUserId() );

		// Are we dealing with an ecommerce event that's been passed in?
		if ( eCommerce ) {

			// Clear the previous ecommerce variables
			dataLayer.push( { ecommerce: null } );

			// We need to glom the additional elements on here
			dataStructure.ecommerce = buildEcommerce( additionalDataObj ); // And spread any additional data
		}
		// If not, we still need to handle any additional data that may have been passed in
		else {

			// It's important to include all of our extant info always!
			dataStructure = {
				...dataStructure, // We need the original bits
				...stripUndefined( additionalDataObj ) // ... and the additional ones
			};
		}

		// Prop up our window layer
		dataLayer.push( buildPayload( dataStructure ) );
	}

	return {
		/**
		 * The master handler for adding elements into the dataLayer for GA4
		 * 
		 * @param {string} eventName						The name of the event
		 * @param {object|undefined} eventData			Any required data we wish to scaffold
		 */
		track : function( eventName, eventData ) {
			traceExecution( 'ga4Tracker.track()' );

			// Find the scaffold for the event we're being asked to emit
			const eventDefinition = eventRegistry[eventName];

			// Have we got a definition for the event? If not, we can't do anything with it
			if ( !eventDefinition ) {
				console.error( 'Event is not valid. Please use one of the following: ' 
					+ Object.keys( eventRegistry ).join( ', ' ) );

				// We can't do anything useful from here
				return false;
			}

			if ( !eventHasRequiredData( eventDefinition, eventData || {} ) ) {
				console.error( 'Event is missing required data: ' 
					+ getMissingRequiredData( eventDefinition, eventData || {} ).join( ', ' ) );

				// We know what is wrong here, so don't try to build an invalid payload
				return false;
			}

			// If the user ID is still pending, hold the event until it resolves
			if ( getUserId() === null && isUserIdPending() ) {

				// If the user ID is still pending, hold the event until it resolves
				pendingPayloads.push( 
					{
						raw : false, // This is a registry payload, not a raw one
						eventName : eventName, // The name of the event we're pushing
						eventData : eventData || {} // Any other data we need to assign to the payload
					}
				);

				// We don't want to emit the event yet, so return true to indicate it's handled
				return true;
			}

			// Build the event from the registry and send it to the payload pusher
			pushPayload(
				eventDefinition.contract.eventName, // The name of the event we're pushing
				eventDefinition.ecommerce, // Is this ecomm? If so, handle it correctly
				buildRegistryEventData( eventName, eventDefinition, eventData || {} ) // Is there anything to build? If not, send back empty
			);

			return true;
		},

		/**
		 * The master handler for adding elements into the dataLayer for GA4
		 * 
		 * @param {string} event                        	The name of the event
		 * @param {boolean} eCommerce						Is this an ecommerce event?
		 * @param {object|undefined} additionalDataObj		Any additional data we wish to push for an event
		 */
		trackRaw : function( event, eCommerce, additionalDataObj ) {
			traceExecution( 'ga4Tracker.trackRaw()' );

			if ( getUserId() === null && isUserIdPending() ) {
				// Preserve the old path if something still pushes prebuilt payloads
				pendingPayloads.push( {
					raw : true,
					event : event,
					eCommerce : eCommerce,
					additionalDataObj : additionalDataObj || {}
				} );
				return true;
			}

			pushPayload( event, eCommerce, additionalDataObj || {} );
			return true;
		},

		/**
		 * Emit any events which had to wait for the SHA sum to finish
		 */
		flush : function() {
			traceExecution( 'ga4Tracker.flush()' );

			// If there is anything pending and we have a user ID, process the queue
			while (
				pendingPayloads.length > 0
				&& !isUserIdPending()
				&& getUserId() !== null
				&& typeof getUserId() !== 'undefined'
			) {

				// Is anything pending? Move it up the stack and process it
				const pendingPayload = pendingPayloads.shift();

				// Have we got a raw payload? Work on it here
				if ( pendingPayload.raw ) {

					// Raw events don't need the event registry, so fire as authored
					this.trackRaw(
						pendingPayload.event,
						pendingPayload.eCommerce,
						pendingPayload.additionalDataObj
					);

					// Proceed with the loop to the next pending payload
					continue;
				}

				// Otherwise, walk through the event registry to build the payload
				this.track( pendingPayload.eventName, pendingPayload.eventData );
			}
		},

		// Expose the list of events for future internal reference
		events : Object.keys( eventRegistry )
	};
}

/**
 * The master handler for adding elements into the dataLayer for GA4
 * 
 * @param {string} event                        	The name of the event
 * @param {boolean} eCommerce						Is this an ecommerce event?
 * @param {object|undefined} additionalDataObj		Any additional data we wish to push for an event
 */
function pushToDataLayer( event, eCommerce, additionalDataObj ) {
	traceExecution( 'pushToDataLayer()' );

	return ga4Tracker.trackRaw( event, eCommerce, additionalDataObj );
}

/**
 * Build the event data from the registry definition
 * 
 * @param {string} eventName					The event name we are building from
 * @param {object} eventDefinition				The event definition from the registry
 * @param {object} eventData					The data handed to the event builder
 * @returns {object}
 */
function buildRegistryEventData( eventName, eventDefinition, eventData ) {
	traceExecution( 'eventRegistry.' + eventName + '.build()' );

	// Send the data into the event's defined builder
	return eventDefinition.build( eventData );
}

/**
 * Build the event contract used to define how the registry expects data
 * 
 * @param {string} eventName					The event name emitted to GA4
 * @param {Array<string>|undefined} requiredData	The required data keys for the builder
 * @returns {object}
 */
function buildEventContract( eventName, requiredData ) {

	// Send back the contract details for this registry entry
	return {
		eventName : eventName, // The event name that will be emitted
		requiredData : requiredData || [], // What data must be present for this event?
		raw : false // Registry events are scaffolded here, not pushed raw
	};
}

/**
 * Does the event have the data it says it needs?
 * 
 * @param {object} eventDefinition	The registry definition we're checking
 * @param {object} eventData		The data handed to the event builder
 * @returns {boolean}
 */
function eventHasRequiredData( eventDefinition, eventData ) {
	traceExecution( 'eventHasRequiredData()' );

	// If there is nothing missing from required data, we can proceed
	return getMissingRequiredData( eventDefinition, eventData ).length === 0;
}

/**
 * Get a list of missing data keys for a registry event
 * 
 * @param {object} eventDefinition	The registry definition we're checking
 * @param {object} eventData		The data handed to the event builder
 * @returns {Array<string>}
 */
function getMissingRequiredData( eventDefinition, eventData ) {
	traceExecution( 'getMissingRequiredData()' );

	let requiredData = eventDefinition.contract.requiredData || [];

	// Only return the things that aren't usable for the builder
	return requiredData.filter( function( requiredDataKey ) {

		// Is there anything here to filter? If not, return nothing
		return typeof eventData[requiredDataKey] === 'undefined'
			|| eventData[requiredDataKey] === null;
	} );
}

/**
 * Build a blank event scaffold when there is no additional data to append
 * 
 * @param {string} eventName	The event name emitted to GA4
 * @returns {object}
 */
function buildEmptyEvent( eventName ) {

	// Send back the bare essentials for an empty event
	return {
		contract : buildEventContract( eventName ), // The event doesn't need additional data
		ecommerce : false, // This can't be an ecomm transaction, so negate it
		build : function() {
			return {}; // We don't need anything, so an empty object will do
		}
	};
}

/**
 * We need our basic structure to submit to the dataLayer
 * 
 * @param {string} event 		The name of the event that's invoked us
 * @param {string} userIdObj 	SHA-256 hash
 * @returns {object}
 */
function buildPayloadStructure( event, userIdObj ) {
	traceExecution( 'buildPayloadStructure()' );

	// Start the dataStructure object to add to
	let dataStructure = {		
		event : event // The name of the event that's invoked us
	};

	// If there is a user ID, use it
	if ( userIdObj !== null && typeof userIdObj !== 'undefined' ) {
		dataStructure.user_id = userIdObj; // SHA-256 hash
	}

	// Send back the raw structure to the caller
	return dataStructure;
}

/**
 * A constructor for a standard payment method
 * 
 * @param {object} paymentMethodObj The payment method object to parse
 * @returns {object}
 */
class PaymentMethod {

	/**
	 * Ingest a raw payment method and return it in a conformed format
	 * 
	 * @param {object} paymentMethodObj The raw payment object to refine
	 * @returns {PaymentMethod}  What does our payment method look like?
	 */
	constructor( paymentMethodObj ) {
		traceExecution( 'PaymentMethod.constructor()' );

		// Put all of our info into the class
		this.currency = 'AUD'; // This should always be AUD
		this.payment_type = paymentMethodObj.ppid; // The payment method PPID
		this.items = []; // We don't have anything, but this keeps the ecomm shape consistent

		// Send back the constructed object
		return this;
	}
}

/**
 * Build a standard payment method object
 * 
 * @param {object} paymentMethodObj The payment method object to parse
 * @returns {object}
 */
function buildPaymentMethod( paymentMethodObj ) {
	traceExecution( 'buildPaymentMethod()' );
	
	// Send back a standard payment method object
	return new PaymentMethod( paymentMethodObj );
}

/**
 * Build a standard product array and optionally append the first item
 * 
 * @param {object|undefined} firstItemObj 	An optional shopItem object to push 
 * 											onto the ItemArray stack
 * @returns {object}
 */
class ItemArray {

	/**
	 * Set up the ItemArray prototype for layer use in the dataLayer
	 * 
	 * @param {object} firstItemObj  The first item in a given set of items
	 * @returns {ItemArray|object}		The conformed array of items in GA4 format
	 */
	constructor( firstItemObj ) {
		traceExecution( 'ItemArray.constructor()' );

		// The items array will always be empty to start
		this.items = [];

		// If we have an item to append, do so now
		if ( typeof firstItemObj !== 'undefined' && firstItemObj ) {
			this.items.push( firstItemObj );
		}

		// Send back the array
		return this;
	}

	/**
	 * Append a product to our items array
	 * 
	 * @param {object} itemObj 
	 */
	newItem( itemObj ) {
		traceExecution( 'ItemArray.newItem()' );

		// Push the item onto the stack
		this.items.push( itemObj );

		// Return the overall object
		return this;
	}

	/**
	 * Simple getter for the items array
	 */
	getItems() {
		traceExecution( 'ItemArray.getItems()' );

		// All we need is the items array
		return this.items;
	}
}

/**
 * Ingests an inputted metadata object and an optional items array to return a GA4-coherent
 * object to the dataLayer
 * 
 * @param {object} metaObj 				The metadata to append
 * @param {object|undefined} itemsObj 	The list of items to append
 * @returns {object}
 */
class AdditionalData {

	/**
	 * Set up the additional data object to push to the dataLayer
	 * 
	 * @param {object} metaObj 	The metadata to append
	 * @param {object} itemsObj The original sibling items object
	 * @returns {AdditionalData|object} A GA4-coherent meta object for the dataLayer
	 */
	constructor( metaObj, itemsObj ) {
		traceExecution( 'AdditionalData.constructor()' );

		// Iterate through the meta object
		for ( const [ key, value ] of Object.entries( stripUndefined( metaObj ) ) ) {
			this[key] = value; // Assign the key/value pair from the parent
		}

		// If we have no items to handle, pretend we do
		if ( typeof itemsObj === 'undefined' || !itemsObj ) {
			this.items = [];
		}
		else {
			// Iterate through the meta object
			this.items = itemsObj;
		}

		// Send back the output 
		return this;
	}
}

/**
 * Construct a prototypical product event for use
 * 
 * @param {object} productObj 
 * @returns {object}
 */
class ProductEvent {

	/**
	 * Take an inputted product event object and return it as a GA4-conformed version
	 * @param {object} productObj 
	 * @returns {ProductEvent|object}	A standardised product event to emit to the dataLayer
	 */
	constructor( productObj ) {
		traceExecution( 'ProductEvent.constructor()' );

		// Tell us about the item we are dealing with
		let itemsObj = new ItemArray( new ShopItem( productObj ) );
		let items = itemsObj.getItems();

		// All the basics
		this.currency = 'AUD'; // Should always be AUD for us
		this.value = calculateItemValue( items ); // The value of the cart
		this.coupon = productObj.coupon ?? 'None set'; // If we have a coupon, use it
		this.starting_balance = getUserStartingBalance(); // Knowing their balance might be useful?

		// Spread the temporary items object back onto our parent scope		
		this.items = items; // Can't do this in one step

		// Maybe we need the additional data?
		return this;
	}
}

/**
 * Constructs a standard product event for use inside the chain of events
 * @param {object} productObj 	A raw product to massage into GA4 format
 * @returns {ProductEvent|object}
 */
function buildProductEvent( productObj ) {
	traceExecution( 'buildProductEvent()' );

	// Send back a standard product event
	return new ProductEvent( productObj );
}

/**
 * Build checkout data for commencement or completion
 * 
 * @param {object} userObj	The user object with cart and order details
 * @returns {object}
 */
function buildCheckoutEvent( userObj ) {
	traceExecution( 'buildCheckoutEvent()' );

	// Set up a holder for the items we're dealing with
	let items = new ItemArray();

	// Iterate through the items in the user's cart and add them to the holder
	for ( var cartProducts = 0; cartProducts < userObj.shopping_cart.length; cartProducts++ ) {

		// Append to the products array
		items.newItem( 
			// Each item gets massaged to suit GA4's requirements and tacked on
			new ShopItem( userObj.shopping_cart[cartProducts] )
		);
	}

	// Add the extra required metadata onto the holder
	let meta = {
		currency : 'AUD', // Always Australian dollars,
		transaction_id : userObj.order.transaction_id ?? null, // Is there an ID?
		value : calculateItemValue( 
			items.getItems() // How much the cart totaled to
		),
		starting_balance : userObj.user_account_bal, // The starting balance of the user's account
		coupon : userObj.order.coupon ?? null  // Are they using a coupon?
	};

	// We have to build our object to send to GA
	return new AdditionalData( meta, items.getItems() );
}

/**
 * Construct a prototypical service for use
 * 
 * @param {object} serviceObj 
 * @returns {object}
 */
class ServiceItem {
	
	/**
	 * Ingest the raw service object and return a standardised service item
	 * 
	 * @param {object} serviceObj 	What are our raw service particulars?
	 * @returns {ServiceItem|object}	A standardised service item to emit to the dataLayer
	 */
	constructor( serviceObj ) {
		traceExecution( 'ServiceItem.constructor()' );

		// We need to build out the service item, so initialise it		
		this.locid = serviceObj.loc_id; // What's the service LOC id?
		this.poi = serviceObj.poi; // How are we connected?
		this.avc = serviceObj.avc; // What's the AVC?
		this.plan_id = serviceObj.plan_id; // What plan are we on?
		this.plan_name = serviceObj.plan; // What's the plan's name?
		this.price = serviceObj.price ?? 'Unknown'; // How much does it cost? If nothing, we don't know

		// Send the service meta back
		return this;
	}	
}

/**
 * 
 * @param {object} serviceObj		A raw service object to conform to a GA4 service item 
 * @returns {ServiceItem|object}	The conformed service object to emit to the dataLayer
 */
function buildServiceItem( serviceObj ) {
	traceExecution( 'buildServiceItem()' );

	// Send back a standard service item
	return new ServiceItem( serviceObj );
}

/**
 * A constructor for an inputted item 
 * 
 * @param {object} itemObj  The item object to build our return object from
 * @returns {ShopItem|object}		The shopItem prototype
 */
class ShopItem {

	/**
	 * Set up the ShopItem prototype for use in the dataLayer
	 * 
	 * @param {object} itemObj 		The item that will become our ShopItem object
	 * @returns {ShopItem|object}	
	 */
	constructor( itemObj ) {
		traceExecution( 'ShopItem.constructor()' );

		// Set up the shop item prototype
		this.item_name = itemObj.name; // The name of the product
		this.item_id = itemObj.id; // The ID of the product
		this.price = Number( itemObj.price || 0 ); // The price of the product
		this.coupon = itemObj.coupon ?? null; // The coupon value for the product
		this.quantity = Number( itemObj.qty || 1 ); // How many of the product were added

		// Send the constructed item back
		return this;
	}
}

/**
 * Construct an ecommerce object
 * 
 * @param {object} inputObj // The original object to interpret as an eComm one
 * @returns {object}
 */
class Ecommerce {

	/**
	 * 
	 * @param {object} inputObj 	The raw object to interpret as an eComm one
	 * @returns {Ecommerce|object}  A sane representation of the input eComm object
	 */
	constructor( inputObj ) {
		traceExecution( 'Ecommerce.constructor()' );
		
		// Iterate through the input object over each value K/V pair
		for ( const [ key, value ] of Object.entries( 

			// Strip out the unwanted noise from the input object
			stripUndefined( inputObj ) ) 
		) {
			// If we got this far, set the key/value pair
			this[key] = value;
		}

		// Pass back the object to the caller
		return this;
	}
}

/**
 * Ingest an input object and return a conformed ecommerce object
 * 
 * @param {object} inputObj 
 * @returns {Ecommerce|object}	The conformed ecommerce object to emit to the dataLayer
 */
function buildEcommerce( inputObj ) {
	traceExecution( 'buildEcommerce()' );

	// Send back an ecommerce-shaped object
	return new Ecommerce( inputObj );
}

/**
 * Construct a payload object
 * 
 * @param {object} inputObj 	
 * @returns {Payload|object}	The massaged payload to emit to the dataLayer
 */
class Payload {

	/**
	 * Set up the payload object to push to the dataLayer
	 * 
	 * @param {object} inputObj 	
	 * @returns {object} 
	 */
	constructor( inputObj ) {
		traceExecution( 'Payload.constructor()' );
		
		// Iterate through the input object's indices to build the payload
		for ( 

			// Each key/value pair we are operating on
			const [ key, value ] of Object.entries( 
				stripUndefined( inputObj ) // Eject undefined values so we don't push them
			) 
		) {
			// Assign the value to the relevant key
			this[key] = value;
		}

		// Pass back the payload object 
		return this;
	}
}

/**
 * 
 * @param {object} inputObj  The input object to conform to a payload
 * @returns {Payload|object}	The massaged payload to emit to the dataLayer
 */
function buildPayload( inputObj ) {
	traceExecution( 'buildPayload()' );

	// Send back the payload object to push to dataLayer
	return new Payload( inputObj );
}

/**
 * Calculate the value of our cart or product event
 * 
 * @param {object} items	The items to accumulate
 * @returns {number}
 */
function calculateItemValue( items ) {
	traceExecution( 'calculateItemValue()' );

	// GA demands a formalised total, so reduce the items down to final total
	const total = items.reduce( 

		// Accumulate the total using the items passed in
		function( totalCost, item ) {

			// Accumulate our total cost collector
			return totalCost + ( 
				Number( item.price || 0 ) // What is the base price for the item?
				* Number( item.quantity || 1 ) // How many actually are there?
			)
		}, 
		0 // Zero is the logical starting point for our accumulator
	);

	// Round the total to two decimal places and return it
	return Math.round( 
		( total + Number.EPSILON ) * 100 // Using epsilon to avoid intermittent FP errors
	) / 100;
}

/**
 * Fetch the starting balance if it's been emitted into the page
 * 
 * @returns {number|null}	The user's starting balance, or not
 */
function getUserStartingBalance() {
	traceExecution( 'getUserStartingBalance()' );

	// Is the user object available? If so, work with it
	if ( typeof user !== 'undefined' 
		&& typeof user.user_account_bal !== 'undefined' ) {
		
		// We have the user object, so return the starting balance
		return user.user_account_bal;
	}

	// Otherwise, there's no balance and making one up does not work here
	return null;
}

/**
 * Strip undefined values so we don't push empty fields into GA4
 * 
 * @param {object} inputObj	The object to sanitize
 * @returns {object}
 */
function stripUndefined( inputObj ) {
	traceExecution( 'stripUndefined()' );

	// Is there an input object? If not, return an empty one
	if ( !inputObj ) {
		return {};
	}

	// Set up a temporary holder for the filtered output
	let outputObj = {};

	// Iterate through the input and only keep real values
	for ( const [ key, value ] of Object.entries( inputObj ) ) {

		// If the value is actually defined, keep it
		if ( typeof value !== 'undefined' ) {

			outputObj[key] = value; // Assign the value to the relevant key
		}
	}

	// Send the refined object back to the caller
	return outputObj;
}

/**
 * Handler for watching page element changes
 */
class FieldObserver {

	/**
	 * Construct the observer object to watch for changes to the page
	 * 
	 * @param {object|undefined} root 	The root element to scope the observer to
	 */
	constructor( root ) {

		// Let the caller scope this to a form, but default to the whole page
		this.root = root || document;

		// List the types of observers possible
		this.observerTypes = [
			'account',
			'referral',
			'notification'
		];

		// Watch our fields for changes		
		this.fieldsChanged = {
			account : { // The general fields for the user account
				'firstname' : false, // First name
				'lastname' : false, // Last name
				'email' : false, // Email address
				'mobno' : false, // Mobile number
				'master_email' : false, // Account manager			
			},
			referral : { // Fields relating to referrals
				'myrefercode' : false, // The code to use for referring others 
				'referbycode' : false, // The code for their referral
				'referralprivate' : false // The user wishes to be anonymous for referrals
			},
			notification : { // Fields relating to notifications
				'notification_level' : false, // The verbosity of notifications dispatched
				'days_before_balance_notify' : false /* The number of days before notice of 
														low balance is sent to the user */
			}
		};

		// Elevate to the global scope to suit the site's requirements, ugh
		fieldsChanged = this.fieldsChanged;
	}

	/**
	 * Actually construct an observer set 
	 * 
	 * @param {string} observerType 	What type of observer do we want to attach?
	 */
	attachObserver( observerType ) {

		// If there is no observer type match, we can't do anything here
		if ( this.observerTypes.indexOf( observerType ) < 0 ) {

			// Concat our valid types to be included in the error
			let observerTypesStr = this.observerTypes.join(', ');

			// Emit a console error informing the user of the failure and valid types
			console.error( 
				'Observer type is not valid. Please use one of the following: ' 
				+ observerTypesStr
			);

			// We can't proceed, so don't try to attach the observer
			return false;
		}

		// Otherwise, iterate over the relevant object keys
		for ( const [ key, value ] of Object.entries( fieldsChanged[observerType] ) ) {

			// Find the input on the page that matches our expected field name
			let input = this.root.querySelector( "input[name='" + key + "']" );

			// If we don't have an input, skip this iteration
			if ( !input ) {
				console.debug( "Input not found for field: " + key );
				continue;
			}

			// Establish a watcher for the change event and update our watcher object
			input.addEventListener(
				'change',
				function() {

					// Emit a change into the parent object
					fieldsChanged[observerType][key] = true;
				}
			);
		}
	}

	/**
	 * Attach all defined observers
	 */
	attachObservers() {

		// Iterate over the observer types and attach them all
		for ( var observer = 0; observer < this.observerTypes.length; observer++ ) {

			// Attach each defined observer type
			this.attachObserver( this.observerTypes[observer] );
		}
	}

	/**
	 * Return the overall watcher state to the client
	 * 
	 * @returns {object}
	 */
	yieldObservers() {

		// Send back the now-filled fieldsChanged object
		return fieldsChanged;
	}
}
