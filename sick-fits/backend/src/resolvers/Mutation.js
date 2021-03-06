const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { promisify } = require("util");
const { transport, styleEmail } = require("../mail");
const { hasPermission } = require("../utils");

const Mutations = {
  async createItem(parent, args, ctx, info) {
    //Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to create items.");
    }
    const item = await ctx.db.mutation.createItem(
      {
        data: {
          //Thi is how to create a relationship between the user and the items
          user: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );

    return item;
  },
  updateItem(args, ctx, info) {
    //first take a copy of the updates
    const updates = { ...args };
    //remove the ID from the updates
    delete updates.id;
    //run the update method
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },
  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id };
    //find the item
    const item = await ctx.db.query.item({ where }, `{id title user{id}}`);
    //check if they own that item, or have the permissions
    const ownsItem = item.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some((permission) =>
      ["ADMIN", "ITEMDELETE"].includes(permission)
    );
    if (!ownsItem && hasPermissions) {
      throw new Error("You don't have permission to do that!");
    }
    //To do
    // delete it
    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async signup(parent, args, ctx, info) {
    //lowercase their email
    args.email = args.email.toLowerCase();
    //hash their password
    const password = await bcrypt.hash(args.password, 10);
    //create user in the database
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ["USER"] },
        },
      },
      info
    );
    //create a JWT token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    //we set the jwt as a cookie on the response
    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, //1 year cookie
    });
    //finally we return the user to the browser
    return user;
  },

  async signin(parent, { email, password }, ctx, info) {
    //1. check if there is a user with that email
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }
    //2. check if their password is correct
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error("Invalid Password!");
    }
    //3. Generate the JWT Token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    //4. Set the cookie with the token
    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, //1 year cookie
    });
    //5. Return the user
    return user;
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie("token");
    return { message: "Goodbye!" };
  },

  async requestReset(parent, { email }, ctx, info) {
    //1. Check if this is a real user
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }

    //2. Set a reset token and expiry on that user
    const randomBytesPromiseified = promisify(randomBytes);
    const resetToken = (await randomBytesPromiseified(20)).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000; //1hour from how
    const res = await ctx.db.mutation.updateUser({
      where: { email },
      data: { resetToken, resetTokenExpiry },
    });
    console.log(res);
    //3. Email them that reset token
    const mailRes = await transport.sendMail({
      from: "effyyzhang@gmail.com",
      to: user.email,
      subject: "Your Password Reset Token",
      html: styleEmail(`Your Password Reset token is here!
      \n\n
      <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">
      Click here to Reset your password
      </a>`),
    });
    //4. return the message
    return { message: "Reset Email sent!" };
  },

  async resetPassword(parent, args, ctx, info) {
    //1. check if the passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error("Passwords doesn't match");
    }
    //2. check if its a legit reset token
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    });

    if (!user) {
      throw new Error("This token is either invalid or expired!");
    }

    //3. check if its expired
    //4. hash their new password
    const password = await bcrypt.hash(args.password, 10);
    //5. save the new password to the user and remove the old reset token
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: { password, resetToken: null, resetTokenExpiry: null },
    });
    //6. generate JWT
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    //7. set the JWT cookie
    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, //1 year cookie
    });
    //8. return the new user
    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    //1. check if the user is logger in
    if (!ctx.request.userId) {
      throw new Error("You must be logged in!");
    }
    //2. Query this user's permissions
    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      info
    );
    //3. Check if this user has the permissions to update the permissions
    hasPermission(currentUser, ["ADMIN", "PERMISSIONUPDATE"]);
    //4. Update the permissions
    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions,
          },
        },
        where: {
          id: args.userId,
        },
      },
      info
    );
  },
};

module.exports = Mutations;
