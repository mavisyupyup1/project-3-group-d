const { AuthenticationError } = require('apollo-server-express');
const { User, Thought, Business, Vote } = require('../models');
const { signToken } = require('../utils/auth');
const path = require('path')
const fs = require('fs')
const stream = require('stream')
const { GraphQLUpload,graphqlUploadExpress, } = require("graphql-upload");
const resolvers = {
  Query: {
    me: async (parent, args, context) => {
      if (context.user) {
        const userData = await User.findOne({ _id: context.user._id })
          .select('-__v -password')
          .populate('thoughts')
          .populate('friends')
          .populate('businesses')
          .populate('votes')

        return userData;
      }

      throw new AuthenticationError('Not logged in');
    },
    users: async () => {
      return User.find()
        .select('-__v -password')
        .populate('thoughts')
        .populate('friends')
        .populate('votes');
    },
    user: async (parent, { username }) => {
      return User.findOne({ username })
        .select('-__v -password')
        .populate('friends')
        .populate('thoughts')
        .populate('votes')
        .populate('businesses');
    },
    thoughts: async (parent, { username }) => {
      const params = username ? { username } : {};
      return Thought.find(params).sort({ createdAt: -1 });
    },
    thought: async (parent, { _id }) => {
      return Thought.findOne({ _id });
    },
    allBusiness: async() => {
      return Business.find()
        .select('-__v')
        .populate('thoughts')
        .populate('votes');
    },
    business: async(parent, { _id }) => {
      return Business.findOne({ _id })
        .select('-__v')
        .populate('thoughts')
        .populate('votes');
    },
    vote: async(parent, { _id }) => {
      return Vote.findOne({ _id })
        .select('-__v')
    }
  },
  Upload: GraphQLUpload,
  Mutation: {
    addUser: async (parent, args) => {
      const user = await User.create(args);
      const token = signToken(user);

      return { token, user };
    },
    login: async (parent, { email, password }) => {
      const user = await User.findOne({ email });

      if (!user) {
        throw new AuthenticationError('Incorrect credentials');
      }

      const correctPw = await user.isCorrectPassword(password);

      if (!correctPw) {
        throw new AuthenticationError('Incorrect credentials');
      }

      const token = signToken(user);
      return { token, user };
    },
    addThought: async (parent, args, context) => {
      if (context.user) {
        const thought = await Thought.create({ ...args, username: context.user.username, userId: context.user._id });

        await User.findByIdAndUpdate(
          { _id: context.user._id },
          { $push: { thoughts: thought._id } },
          { new: true }
        );

        if(thought.businessId){
          await Business.findByIdAndUpdate(
            { _id: thought.businessId },
            { $push: { thoughts: thought._id } },
            { new: true }
          );
        }

        return thought;
      }

      throw new AuthenticationError('You need to be logged in!');
    },
    addReaction: async (parent, { thoughtId, reactionBody }, context) => {
      if (context.user) {
        const updatedThought = await Thought.findOneAndUpdate(
          { _id: thoughtId },
          { $push: { reactions: { reactionBody, username: context.user.username } } },
          { new: true, runValidators: true }
        );

        return updatedThought;
      }

      throw new AuthenticationError('You need to be logged in!');
    },
    addFriend: async (parent, { friendId }, context) => {
      if (context.user) {
        const updatedUser = await User.findOneAndUpdate(
          { _id: context.user._id },
          { $addToSet: { friends: friendId } },
          { new: true }
        ).populate('friends');

        return updatedUser;
      }

      throw new AuthenticationError('You need to be logged in!');
    },
    addBusiness: async(parent, { business }, context) => {
      if(context.user) {
        const newBusiness = await Business.create({...business, userId: context.user._id });

        await User.findByIdAndUpdate(
          { _id: context.user._id },
          { $push: { businesses: newBusiness._id } },
          { new: true, runValidators: true }
        ).populate('businesses');

        return newBusiness;
      }

      throw new AuthenticationError('You need to be logged in!');
    },
    addVote: async(parent, args, context) => {
      if(context.user){
        const vote = await Vote.create({...args, userId: context.user._id});

        await Business.findByIdAndUpdate(
          { _id: vote.businessId },
          { $push: { votes: vote._id } },
          { new: true}
        ).populate('votes');
        
        await User.findByIdAndUpdate(
          { _id: context.user._id },
          { $push: { votes: vote._id } },
          { new: true }
        ).populate('votes');

        return vote;
      }

      throw new AuthenticationError('You need to be logged in!');
    },
    updateVote: async(parent, { voteType, _id }, context) => {
      if(context.user){
        const updatedVote = await Vote.findOneAndUpdate(
          { _id: _id },
          { voteType: voteType },
          { new: true }
        );

        return updatedVote;
      }

      throw new AuthenticationError('You need to be logged in!');
    },
    addStripe: async(parent,{stripeId},context)=>{
      if (context.user) {
        const updatedUser = await User.findOneAndUpdate(
          { _id: context.user._id },
          { stripeId: stripeId},
          { new: true }
        );
        return updatedUser;
      }
      throw new AuthenticationError('You need to be logged in!');
    },

    uploadFile: async (parent, { file }) => {
      const { createReadStream, filename, mimetype, encoding } = await file;

      // Invoking the `createReadStream` will return a Readable Stream.
      // See https://nodejs.org/api/stream.html#stream_readable_streams
      // const stream = createReadStream();

      // This is purely for demonstration purposes and will overwrite the
      // local-file-output.txt in the current working directory on EACH upload.
      const pathName = path.join(__dirname,`../../client/public/images/${filename}`)
      await stream.pipe(fs.createWriteStream(pathName));
    
      return  { filename, mimetype, encoding };
      //return { url:`http://localhost:3000/images/${filename}` };
    },
  }
};

module.exports = resolvers;

