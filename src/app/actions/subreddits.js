import { endpoints, models } from '@r/api-client';
import { apiOptionsFromState } from 'lib/apiOptionsFromState';
import { receivedResponse, updatedModel } from './apiResponse';
import isFakeSubreddit from 'lib/isFakeSubreddit';

const { SubredditEndpoint } = endpoints;

export const FETCHING_SUBREDDIT = 'FETCHING_SUBREDDIT';
export const fetchingSubreddit = name => ({ type: FETCHING_SUBREDDIT, name });

export const RECEIVED_SUBREDDIT = 'RECEIVED_SUBREDDIT';
export const receivedSubreddit = (name) => ({ type: RECEIVED_SUBREDDIT, name });

export const FAILED_SUBREDDIT = 'FAILED_SUBREDDIT';
export const failedSubreddit = name => ({ type: FAILED_SUBREDDIT, name });

export const fetchSubreddit = (name) => async (dispatch, getState) => {
  if (isFakeSubreddit(name)) { return; }

  const state = getState();
  const pendingRequest = state.subredditRequests[name];
  if (pendingRequest && !pendingRequest.failed && !pendingRequest.loading) {
    return;
  }

  dispatch(fetchingSubreddit(name));

  try {
    const response = await SubredditEndpoint.get(apiOptionsFromState(state), { id: name });
    dispatch(receivedResponse(response));
    dispatch(receivedSubreddit(name));
  } catch (e) {
    dispatch(failedSubreddit(name));
  }
};

const { Subreddit, ModelTypes } = models;
const { SUBREDDIT } = ModelTypes;

export const toggleSubscription = ({ subredditName, fullName, isSubscriber }) => {
  // we take the fullName and isSubscriber so we don't have to make any api calls
  // on the server to lookup the subreddit;
  return async (dispatch, getState) => {
    if (isFakeSubreddit(subredditName)) { return; }

    const state = getState();
    let subreddit = state.subreddits[subredditName];
    if (!subreddit) {
      subreddit = Subreddit.fromJSON({ name: fullName, user_is_subscriber: isSubscriber });
    }

    const stub = subreddit.toggleSubscribed(apiOptionsFromState(state));
    dispatch(updatedModel(stub, SUBREDDIT));

    try {
      const resolved = await stub.promise();
      dispatch(updatedModel(resolved, SUBREDDIT));
    } catch (e) {
      dispatch(updatedModel(subreddit, SUBREDDIT));
    }

    // todo redirect based on referrer;
  };
};
