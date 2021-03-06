'use strict'; /*jslint mocha:true, expr:true */

var crypto = require('crypto');
var node = require('./../node.js');

var genesisblock = require('../../genesisBlock.json');

function postTransaction (transaction, done) {
	node.post('/peer/transactions', {
		transaction: transaction
	}, done);
}

function getAddress (address, done) {
	node.get('/api/accounts?address=' + address, done);
}

describe('GET /peer/transactions', function () {

	it('using vendorField should be ok', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 1, "this is a test vendorfield", node.gAccount.password);
		console.log(transaction);
		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
			done();
		});
	});

	it('using incorrect nethash in headers should fail', function (done) {
		node.get('/peer/transactions')
			.set('nethash', 'incorrect')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body.expected).to.equal(node.config.nethash);
				done();
			});
	});

	it('using valid headers should be ok', function (done) {
		node.get('/peer/transactions')
			.end(function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').to.be.an('array');
			done();
		});
	});
});

describe('POST /peer/transactions', function () {

	it('using incorrect nethash in headers should fail', function (done) {
		node.post('/peer/transactions')
			.set('nethash', 'incorrect')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body.expected).to.equal(node.config.nethash);
				done();
			});
	});

	it('using valid headers should be ok', function (done) {
		var transaction = node.ark.transaction.createTransaction('1A', 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
			done();
		});
	});

	it('using already processed transaction should be not ok (preventing spam)', function (done) {
		var transaction = node.ark.transaction.createTransaction('2A', 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

			postTransaction(transaction, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				done();
			});
		});
	});

	it('using already confirmed transaction should be not ok', function (done) {
		var transaction = node.ark.transaction.createTransaction('3A', 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

			node.onNewBlock(function (err) {
				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					done();
				});
			});
		});
	});

	it('using varying recipientId casing should go to same address', function (done) {
		var account = node.randomAccount();
		var keys = node.ark.crypto.getKeys(account.password);
		var address = node.ark.crypto.getAddress(keys.publicKey);

		var transaction = node.ark.transaction.createTransaction(address, 100000000, null, node.gAccount.password);
		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;

			node.onNewBlock(function (err) {
				var transaction2 = node.ark.transaction.createTransaction(address.toLowerCase(), 100000000, null, node.gAccount.password);
				postTransaction(transaction2, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.ok;

					node.onNewBlock(function (err) {
						getAddress(address, function (err, res) {
							node.expect(res.body).to.have.property('success').to.be.ok;
							node.expect(res.body).to.have.property('account').that.is.an('object');
							node.expect(res.body.account).to.have.property('balance').to.equal('200000000');
							done();
						});
					});
				});
			});
		});
	});

	it('using transaction with undefined recipientId should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction(undefined, 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using transaction with negative amount should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('1A', -1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using invalid passphrase should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 1, null, node.gAccount.password);
		transaction.recipientId = '1A';
		transaction.id = node.ark.crypto.getId(transaction);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('when sender has no funds should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('1A', 1, null, 'randomstring');

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ARK: [0-9]+L balance: 0/);
			done();
		});
	});

	it('when sender does not have enough funds should always fail', function (done) {
		var account = node.randomAccount();
		var transaction = node.ark.transaction.createTransaction(account.address, 1, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

			node.onNewBlock(function () {
				var count = 1;
				var transaction2 = node.ark.transaction.createTransaction(node.gAccount.address, 2, null, account.password);

				node.async.doUntil(function (next) {
					postTransaction(transaction2, function (err, res) {
						node.expect(res.body).to.have.property('success').to.be.not.ok;
						node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ARK: [0-9]+L balance: 1e-8/);
						count++;
						return next();
					});
				}, function () {
					return count === 10;
				}, function () {
					return done();
				});
			});
		});
	});

	it('using fake signature should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 1, null, node.gAccount.password);
		transaction.signature = crypto.randomBytes(64).toString('hex');
		transaction.id = node.ark.crypto.getId(transaction);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using invalid publicKey should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 1, null, node.gAccount.password);
		transaction.senderPublicKey = node.randomPassword();

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using invalid signature should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 1, null, node.gAccount.password);
		transaction.signature = node.randomPassword();

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using very large amount and genesis block id should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 100000000000000000, null, node.gAccount.password);
		transaction.blockId = genesisblock.id;

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using overflown amount should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 184819291270000000012910218291201281920128129, null,
		node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	it('using float amount should fail', function (done) {
		var transaction = node.ark.transaction.createTransaction('12A', 1.3, null, node.gAccount.password);

		postTransaction(transaction, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('message');
			done();
		});
	});

	describe('when two passphrases collide into the same address', function () {

		var collision = {
			address: '13555181540209512417A',
			passphrases: [
				'merry field slogan sibling convince gold coffee town fold glad mix page',
				'annual youth lift quote off olive uncle town chief poverty extend series'
			]
		};

		before(function (done) {
			var transaction = node.ark.transaction.createTransaction(collision.address, 220000000, null, node.gAccount.password);
			postTransaction(transaction, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.ok;
				node.onNewBlock(done);
			});
		});

		describe('when transaction is invalid', function () {

			it('should fail for passphrase two', function (done) {
				var transaction = node.ark.transaction.createTransaction(node.gAccount.address, 100000000, null, collision.passphrases[1]);
				transaction.signature = crypto.randomBytes(64).toString('hex');
				transaction.id = node.ark.crypto.getId(transaction);

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					node.expect(res.body).to.have.property('message').to.equal('Failed to verify signature');
					done();
				});
			});

			it('should fail for passphrase one', function (done) {
				var transaction = node.ark.transaction.createTransaction(node.gAccount.address, 100000000, null, collision.passphrases[0]);
				transaction.signature = crypto.randomBytes(64).toString('hex');
				transaction.id = node.ark.crypto.getId(transaction);

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					node.expect(res.body).to.have.property('message').to.equal('Failed to verify signature');
					done();
				});
			});
		});

		describe('when transaction is valid', function () {

			it('should be ok for passphrase one', function (done) {
				var transaction = node.ark.transaction.createTransaction(node.gAccount.address, 100000000, null, collision.passphrases[0]);

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.ok;
					done();
				});
			});

			it('should fail for passphrase two', function (done) {
				var transaction = node.ark.transaction.createTransaction(node.gAccount.address, 100000000, null, collision.passphrases[1]);

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					node.expect(res.body).to.have.property('message').to.equal('Invalid sender public key: b26dd40ba33e4785e49ddc4f106c0493ed00695817235c778f487aea5866400a expected: ce33db918b059a6e99c402963b42cf51c695068007ef01d8c383bb8a41270263');
					done();
				});
			});
		});
	});
});
