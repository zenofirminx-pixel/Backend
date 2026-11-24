import * as social from '../services/socialService.js';
import { success, asyncHandler } from '../utils/http.js';
export const feed = asyncHandler(async (req, res) => success(res, await social.getFeed({ uid: req.user.uid, limit: req.query.limit, before: req.query.before })));
export const createPost = asyncHandler(async (req, res) => success(res, { post: await social.createPost(req.user.uid, req.body) }, 201));
export const deletePost = asyncHandler(async (req, res) => success(res, await social.deletePost(req.user.uid, req.params.postId)));
export const likePost = asyncHandler(async (req, res) => success(res, await social.toggleLike(req.user.uid, req.params.postId)));
export const getComments = asyncHandler(async (req, res) => success(res, { comments: await social.listComments(req.params.postId, req.query.limit) }));
export const postComment = asyncHandler(async (req, res) => success(res, { comment: await social.addComment(req.user.uid, req.params.postId, req.body.text) }, 201));
export const search = asyncHandler(async (req, res) => success(res, { users: await social.searchUsers(req.user.uid, req.query.q) }));
export const requestFriend = asyncHandler(async (req, res) => success(res, await social.sendFriendRequest(req.user.uid, req.params.uid), 201));
export const acceptFriend = asyncHandler(async (req, res) => success(res, await social.acceptFriendRequest(req.user.uid, req.params.uid)));
export const friends = asyncHandler(async (req, res) => success(res, { friends: await social.listFriends(req.user.uid) }));
export const friendRequests = asyncHandler(async (req, res) => success(res, { requests: await social.listFriendRequests(req.user.uid) }));
export const conversations = asyncHandler(async (req, res) => success(res, { conversations: await social.listConversations(req.user.uid) }));
export const messages = asyncHandler(async (req, res) => success(res, { messages: await social.listMessages(req.user.uid, req.params.uid, req.query.limit) }));
export const sendMessage = asyncHandler(async (req, res) => success(res, { message: await social.sendMessage(req.user.uid, req.params.uid, req.body.text) }, 201));
export const notifications = asyncHandler(async (req, res) => success(res, { notifications: await social.listNotifications(req.user.uid, req.query.limit) }));
export const markNotification = asyncHandler(async (req, res) => success(res, await social.markNotificationRead(req.user.uid, req.params.notificationId)));
export const publicProfile = asyncHandler(async (req, res) => success(res, await social.getPublicProfile(req.user.uid, req.params.uid)));

export const declineFriend = asyncHandler(async (req, res) => success(res, await social.declineFriendRequest(req.user.uid, req.params.uid)));
export const removeFriend = asyncHandler(async (req, res) => success(res, await social.removeFriend(req.user.uid, req.params.uid)));

export const block = asyncHandler(async (req, res) => success(res, await social.blockUser(req.user.uid, req.params.uid)));
export const unblock = asyncHandler(async (req, res) => success(res, await social.unblockUser(req.user.uid, req.params.uid)));
export const blocked = asyncHandler(async (req, res) => success(res, { users: await social.listBlockedUsers(req.user.uid) }));
export const report = asyncHandler(async (req, res) => success(res, await social.reportContent(req.user.uid, req.body), 201));
