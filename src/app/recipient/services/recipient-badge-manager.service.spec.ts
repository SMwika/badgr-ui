import { TestBed, inject } from "@angular/core/testing";
import { SystemConfigService } from "../../common/services/config.service";
import { MockBackend } from "@angular/http/testing";
import { BaseRequestOptions, Http, RequestMethod } from "@angular/http";
import { CommonEntityManager } from "../../entity-manager/common-entity-manager.service";
import { expectRequestAndRespondWith } from "../../common/util/mock-response-util";
import { verifyManagedEntitySet, verifyEntitySetWhenLoaded } from "../../common/model/managed-entity-set.spec";
import { RecipientBadgeApiService } from "./recipient-badges-api.service";
import { RecipientBadgeManager } from "./recipient-badge-manager.service";
import { ApiRecipientBadgeInstance } from "../models/recipient-badge-api.model";
import { buildTestRecipientBadges } from "../models/recipient-badge.model.spec";
import { RecipientBadgeCollectionManager } from "./recipient-badge-collection-manager.service";
import { buildTestRecipientBadgeCollections } from "../models/recipient-badge-collection.model.spec";
import { expectAllCollectionsRequest, expectCollectionPut } from "./recipient-badge-collection-manager.service.spec";
import { RecipientBadgeCollectionApiService } from "./recipient-badge-collection-api.service";
import { MessageService } from "../../common/services/message.service";
import { EventsService } from "../../common/services/events.service";
import { SessionService } from "../../common/services/session.service";

describe('RecipientBadgeManger', () => {
	beforeEach(() => TestBed.configureTestingModule({
		declarations: [  ],
		providers: [
			SystemConfigService,
			MockBackend,
			BaseRequestOptions,
			MessageService,
			{ provide: 'config', useValue: { api: { baseUrl: '' }, features: {} } },
			{
				provide: Http,
				useFactory: (backend, options) => new Http(backend, options),
				deps: [ MockBackend, BaseRequestOptions ]
			},

			SessionService,
			CommonEntityManager,
			RecipientBadgeApiService,
			RecipientBadgeManager,
		  RecipientBadgeCollectionManager,
		  RecipientBadgeCollectionApiService,
			EventsService
		],
		imports: [ ]
	}));

	beforeEach(inject([ SessionService ], (loginService: SessionService) => {
		loginService.storeToken({ token: "MOCKTOKEN" });
	}));

	it('should retrieve all recipient badges',
		inject(
			[ RecipientBadgeManager, MockBackend ],
			(recipientBadgeManager: RecipientBadgeManager, mockBackend: MockBackend) => {
				const testData = buildTestRecipientBadges();

				return Promise.all([
					expectAllBadgesRequest(mockBackend, testData.apiBadges),
					verifyEntitySetWhenLoaded(recipientBadgeManager.recipientBadgeList, testData.apiBadges)
				])
			}
		)
	);

	it('should retrieve recipientBadges on subscription of allRecipientBadges$',
		inject(
			[ RecipientBadgeManager, MockBackend ],
			(recipientBadgeManager: RecipientBadgeManager, mockBackend: MockBackend) => {
				const testData = buildTestRecipientBadges();

				return Promise.all([
					expectAllBadgesRequest(mockBackend, testData.apiBadges),
					recipientBadgeManager.recipientBadgeList.loadedPromise.then(() => {
						verifyManagedEntitySet(recipientBadgeManager.recipientBadgeList, testData.apiBadges)
					})
				])
			}
		)
	);

	it('should add a new badge',
		inject(
			[ RecipientBadgeManager, MockBackend ],
			(recipientBadgeManager: RecipientBadgeManager, mockBackend: MockBackend) => {
				const testData = buildTestRecipientBadges();

				let existingRecipientBadge = testData.apiBadge1;
				let newRecipientBadge = testData.apiBadge2;

				return Promise.all([
					expectAllBadgesRequest(mockBackend, [ existingRecipientBadge ]),
					expectRequestAndRespondWith(
						mockBackend,
						RequestMethod.Post,
						`/v1/earner/badges?json_format=plain`,
						newRecipientBadge,
						201
					),
					verifyEntitySetWhenLoaded(recipientBadgeManager.recipientBadgeList, [ existingRecipientBadge ])
						.then(recipientBadgesList => recipientBadgeManager.createRecipientBadge({
							assertion: JSON.stringify(newRecipientBadge)
						}))
						.then(() => verifyManagedEntitySet(recipientBadgeManager.recipientBadgeList, [ newRecipientBadge, existingRecipientBadge ]))
				])
			}
		)
	);

	it('should list associated collections',
		inject(
			[ RecipientBadgeManager, RecipientBadgeCollectionManager, MockBackend ],
			(recipientBadgeManager: RecipientBadgeManager, collectionManager: RecipientBadgeCollectionManager, mockBackend: MockBackend) => {
				const testBadges = buildTestRecipientBadges();
				const testCollections = buildTestRecipientBadgeCollections();

				let apiBadge = testBadges.apiBadge1;
				let extraCollection = testCollections.apiCollection1;
				let containingCollection = testCollections.apiCollection2;

				extraCollection.badges = [];
				containingCollection.badges = [{
					id: apiBadge.id + "",
					description: ""
				}];

				return Promise.all([
					expectAllBadgesRequest(mockBackend, [ apiBadge ]),
					expectAllCollectionsRequest(mockBackend, [ extraCollection, containingCollection ]),
					verifyEntitySetWhenLoaded(recipientBadgeManager.recipientBadgeList, [ apiBadge ])
						.then(list => list.entityForApiEntity(apiBadge))
						.then(badge => {
							return badge.collections.loadedPromise.then(
								collections => expect(collections.entities)
									.toEqual(collectionManager.recipientBadgeCollectionList.entitiesForApiEntities([ containingCollection ]))
							)
						})
				])
			}
		)
	);

	it('should update associated collections when they are modified',
		inject(
			[ RecipientBadgeManager, RecipientBadgeCollectionManager, MockBackend ],
			(recipientBadgeManager: RecipientBadgeManager, collectionManager: RecipientBadgeCollectionManager, mockBackend: MockBackend) => {
				const collectionList = collectionManager.recipientBadgeCollectionList;

				const testBadges = buildTestRecipientBadges();
				const testCollections = buildTestRecipientBadgeCollections();

				let apiBadge = testBadges.apiBadge1;
				let extraCollection = testCollections.apiCollection1;
				let containingCollection = testCollections.apiCollection2;

				extraCollection.badges = [];
				containingCollection.badges = [];

				return Promise.all([
					expectAllBadgesRequest(mockBackend, [ apiBadge ]),
					expectAllCollectionsRequest(mockBackend, [ extraCollection, containingCollection ]),
					verifyEntitySetWhenLoaded(recipientBadgeManager.recipientBadgeList, [ apiBadge ])
						.then(list => list.entityForApiEntity(apiBadge))
						.then(badge => {
							return badge.collections.loadedPromise.then(
								collections => {
									try {
										return badge.collections.changed$.skip(1).first().toPromise().then(() =>
											expect(collections.entities.map(e => e.url))
												.toEqual(collectionManager.recipientBadgeCollectionList.entitiesForApiEntities([ containingCollection ]).map(
													e => e.url))
										)
									} finally {
										collectionList.entityForApiEntity(containingCollection).addBadge(badge);
									}
								}
							)
						})
				])
			}
		)
	);

	it('should handle adding and removing collections',
		inject(
			[ RecipientBadgeManager, RecipientBadgeCollectionManager, MockBackend ],
			(recipientBadgeManager: RecipientBadgeManager, collectionManager: RecipientBadgeCollectionManager, mockBackend: MockBackend) => {
				const collectionList = collectionManager.recipientBadgeCollectionList;

				const testBadges = buildTestRecipientBadges();
				const testCollections = buildTestRecipientBadgeCollections();

				const apiBadge = testBadges.apiBadge1;
				const addCollection = testCollections.apiCollection1;
				const removeCollection = testCollections.apiCollection2;

				addCollection.badges = [];
				removeCollection.badges = [{
					id: apiBadge.id + "",
					description: ""
				}];

				const addCollectionResponse = Object.assign(
					{},
					addCollection,
					{ badges: removeCollection.badges }
				);

				const removeCollectionResponse = Object.assign(
					{},
					removeCollection,
					{ badges: [] }
				);


				return Promise.all([
					expectAllBadgesRequest(mockBackend, [ apiBadge ]),
					expectAllCollectionsRequest(mockBackend, [ addCollection, removeCollection ]),
					verifyEntitySetWhenLoaded(recipientBadgeManager.recipientBadgeList, [ apiBadge ])
						.then(list => list.entityForApiEntity(apiBadge))
						.then(badge => {
							return badge.collections.loadedPromise.then(
								collections => {
									collections.add(collectionList.entityForApiEntity(addCollection));
									collections.remove(collectionList.entityForApiEntity(removeCollection));

									return Promise.all([
										expectCollectionPut(mockBackend, addCollectionResponse),
										expectCollectionPut(mockBackend, removeCollectionResponse),
										badge.save()
									]);
								}
							)
						})
				])
			}
		)
	);

});

function expectAllBadgesRequest(mockBackend: MockBackend, badges: ApiRecipientBadgeInstance[]) {
	return expectRequestAndRespondWith(
		mockBackend,
		RequestMethod.Get,
		`/v1/earner/badges?json_format=plain`,
		badges
	);
}
