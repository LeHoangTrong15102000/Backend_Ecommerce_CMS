const { CONFIG_MESSAGE_ERRORS, PAYMENT_TYPES } = require('../configs');
const Order = require('../models/OrderProduct');
const PaymentType = require('../models/PaymentType');
const Product = require('../models/ProductModel');
const EmailService = require('../services/EmailService');
const { preparePaginationAndSorting, buildQuery } = require('../utils');
const mongoose = require('mongoose');

const updateProductStock = async (order) => {
  try {
    const productData = await Product.findOneAndUpdate(
      { _id: order.product, countInStock: { $gte: order.amount } },
      { $inc: { countInStock: -order.amount, sold: +order.amount } },
      { new: true }
    );

    if (productData) {
      return {
        status: CONFIG_MESSAGE_ERRORS.ACTION_SUCCESS.status,
        message: 'Success',
        typeError: '',
        data: productData,
        statusMessage: 'Success',
      };
    } else {
      return {
        status: CONFIG_MESSAGE_ERRORS.INVALID.status,
        message: 'Error',
        typeError: '',
        statusMessage: 'Error',
        id: order.product,
      };
    }
  } catch (error) {
    return {
      status: CONFIG_MESSAGE_ERRORS.INTERNAL_ERROR.status,
      message: 'Error',
      typeError: '',
      statusMessage: 'Error',
      id: order.product,
    };
  }
};

const createOrder = (newOrder) => {
  return new Promise(async (resolve, reject) => {
    const {
      orderItems,
      paymentMethod,
      itemsPrice,
      shippingPrice,
      totalPrice,
      fullName,
      address,
      city,
      phone,
      user,
      isPaid,
      paidAt,
      email,
      deliveryMethod,
    } = newOrder;
    try {
      const promises = newOrder.orderItems.map(updateProductStock);
      const results = await Promise.all(promises);
      const newData = results && results.filter((item) => item.id);
      if (newData.length) {
        const arrId = [];
        newData.forEach((item) => {
          arrId.push(item.id);
        });
        resolve({
          message: `The product with id: ${arrId.join(',')} out of the stock`,
          status: CONFIG_MESSAGE_ERRORS.INTERNAL_ERROR.status,
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          statusMessage: 'Error',
          data: null,
        });
      } else {
        const dataCreate = {
          orderItems,
          shippingAddress: {
            fullName,
            address,
            city,
            phone,
          },
          itemsPrice,
          shippingPrice,
          totalPrice,
          user: user,
          isDelivered: false,
          isPaid,
          paidAt,
        };
        if (deliveryMethod) {
          dataCreate.deliveryMethod = deliveryMethod;
        }
        if (paymentMethod) {
          const findPayment = await PaymentType.findById(paymentMethod);
          dataCreate.paymentMethod = paymentMethod;
          if (findPayment.type !== PAYMENT_TYPES.PAYMENT_LATER) {
            // Tại vì PAYMENT_LATER là phương thức nhận hàng khi thanh toán
            // Nếu như nó khác thằng PAYMENT_LATER có nghĩa là chờ thanh toán
            // Thì lúc này khi mà là thanh toán sau thì nó sẽ mặc định `chờ giao hàng`
            dataCreate.status = 0;
          }
        }
        const createdOrder = await Order.create(dataCreate);
        if (createdOrder) {
          resolve({
            status: CONFIG_MESSAGE_ERRORS.ACTION_SUCCESS.status,
            message: 'Success',
            typeError: '',
            data: createdOrder,
            statusMessage: 'Success',
          });
        }
        // await EmailService.sendEmailCreateOrder(email, orderItems);
      }
    } catch (e) {
      //   console.log('e', e)
      reject(e);
    }
  });
};

const getOrderDetails = (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const checkOrder = await Order.findById({
        _id: id,
      });
      if (checkOrder === null) {
        resolve({
          status: CONFIG_MESSAGE_ERRORS.INVALID.status,
          message: 'The product is not existed',
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          data: null,
          statusMessage: 'Error',
        });
      }
      resolve({
        status: CONFIG_MESSAGE_ERRORS.GET_SUCCESS.status,
        message: 'Success',
        typeError: '',
        data: checkOrder,
        statusMessage: 'Success',
      });
    } catch (e) {
      reject(e);
    }
  });
};

const deleteOrderProduct = (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const checkOrder = await Order.findById(id);
      if (!checkOrder) {
        resolve({
          status: CONFIG_MESSAGE_ERRORS.INVALID.status,
          message: 'The order product is not existed',
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          data: null,
          statusMessage: 'Error',
        });
      }

      const deletedOrder = await Order.findByIdAndDelete(id);
      if (!deletedOrder) {
        return resolve({
          status: 'ERR',
          message: 'Failed to delete order',
        });
      }

      await Promise.all(
        checkOrder.orderItems.map(async (orderItem) => {
          const product = await Product.findById(orderItem.product);
          if (product) {
            await Product.findByIdAndUpdate(orderItem.product, {
              $inc: {
                countInStock: orderItem.amount,
                sold: -orderItem.amount,
              },
            });
          }
        })
      );

      resolve({
        message: 'Order deleted successfully',
        status: CONFIG_MESSAGE_ERRORS.ACTION_SUCCESS.status,
        typeError: '',
        statusMessage: 'Success',
        data: deletedOrder,
      });
    } catch (e) {
      reject(e);
    }
  });
};

const updateOrder = (id, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const existingOrder = await Order.findById(id);

      if (!existingOrder) {
        reject({
          status: CONFIG_MESSAGE_ERRORS.INVALID.status,
          message: `Order with ID ${id} not found`,
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          data: null,
          statusMessage: 'Error',
        });
        return;
      }

      existingOrder.orderItems = data.orderItems || existingOrder.orderItems;
      existingOrder.shippingAddress =
        data.shippingAddress || existingOrder.shippingAddress;
      existingOrder.paymentMethod = data.paymentMethod || existingOrder.paymentMethod;
      existingOrder.deliveryMethod = data.deliveryMethod || existingOrder.deliveryMethod;
      existingOrder.itemsPrice = data.itemsPrice || existingOrder.itemsPrice;
      existingOrder.shippingPrice = data.shippingPrice || existingOrder.shippingPrice;
      existingOrder.totalPrice = data.totalPrice || existingOrder.totalPrice;
      existingOrder.isPaid = data.isPaid || existingOrder.isPaid;
      existingOrder.paidAt = data.paidAt || existingOrder.paidAt;
      existingOrder.deliveryAt = data.deliveryAt || existingOrder.deliveryAt;

      const savedOrder = await existingOrder.save();

      resolve({
        status: CONFIG_MESSAGE_ERRORS.ACTION_SUCCESS.status,
        message: 'Order updated successfully',
        typeError: '',
        data: savedOrder,
        statusMessage: 'Success',
      });
    } catch (error) {
      reject(error);
    }
  });
};

const cancelOrder = (orderId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        resolve({
          status: CONFIG_MESSAGE_ERRORS.INVALID.status,
          message: 'The Order is not existed',
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          data: null,
          statusMessage: 'Error',
        });
        return;
      }

      if (order.isPaid === 1) {
        resolve({
          status: CONFIG_MESSAGE_ERRORS.INVALID.status,
          message: 'Cannot cancel order that has been paid',
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          data: null,
          statusMessage: 'Error',
        });
        return;
      }

      order.status = 3;
      await order.save();
      resolve({
        status: CONFIG_MESSAGE_ERRORS.ACTION_SUCCESS.status,
        message: 'Order cancelled successfully',
        typeError: '',
        data: order,
        statusMessage: 'Success',
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Lấy tất cả order trong cái hệ thống của chúng ta luôn
const getAllOrder = (params) => {
  return new Promise(async (resolve, reject) => {
    try {
      const limit = params?.limit ? +params?.limit : 10;
      const search = params?.search ?? '';
      const page = params?.page ? +params.page : 1;
      const order = params?.order ?? 'created desc';
      const userId = params.userId ?? '';
      const productId = params.productId ?? '';
      const status = params.status ?? '';
      const cityId = params.cityId ?? '';
      const query = {};
      // const query = buildQuery(search);

      if (search) {
        const searchRegex = { $regex: search, $options: 'i' };

        query.$or = [{ 'orderItems.name': searchRegex }];
      }

      const { startIndex, sortOptions } = preparePaginationAndSorting(page, limit, order);

      if (userId) {
        const userIds = userId?.split('|').map((id) => mongoose.Types.ObjectId(id));
        query.user =
          userIds.length > 1 ? { $in: userIds } : mongoose.Types.ObjectId(userId);
      }

      if (productId) {
        const productIds = productId?.split('|').map((id) => mongoose.Types.ObjectId(id));
        query.product =
          productIds.length > 1
            ? { $in: productIds }
            : mongoose.Types.ObjectId(productId);
      }
      if (cityId) {
        const cityIds = cityId?.split('|').map((id) => mongoose.Types.ObjectId(id));
        query['shippingAddress.city'] =
          cityIds.length > 1 ? { $in: cityIds } : mongoose.Types.ObjectId(cityId);
      }

      if (status) {
        const statusOrder = status?.split('|').map((id) => id);
        query.status = { $in: statusOrder };
      }

      const totalCount = await Order.countDocuments(query);

      const totalPage = Math.ceil(totalCount / limit);

      const fieldsToSelect = {
        status: 1,
        // email: 1,
        orderItems: 1,
        shippingAddress: 1,
        paymentMethod: 1,
        // deliveryMethod: 1,
        // itemsPrice: 1,
        shippingPrice: 1,
        totalPrice: 1,
        // isPaid: 1,
        // paidAt: 1,
        deliveryAt: 1,
        // isDelivered: 1,
        // createdAt: 1,
        // user: 1,
      };

      if (page === -1 && limit === -1) {
        const allOrder = await Order.find(query)
          .sort(sortOptions)
          .select(fieldsToSelect)
          .populate({
            path: 'shippingAddress.city',
            select: '_id name',
          });
        resolve({
          status: CONFIG_MESSAGE_ERRORS.GET_SUCCESS.status,
          message: 'Success',
          typeError: '',
          statusMessage: 'Success',
          data: {
            orders: allOrder,
            totalPage: 1,
            totalCount: totalCount,
          },
        });
        return;
      }

      const allOrder = await Order.find(query)
        .skip(startIndex)
        .limit(limit)
        .sort(sortOptions)
        .select(fieldsToSelect)
        .populate({
          path: 'shippingAddress.city',
          select: '_id name',
        });
      resolve({
        status: CONFIG_MESSAGE_ERRORS.GET_SUCCESS.status,
        message: 'Success',
        typeError: '',
        statusMessage: 'Success',
        data: {
          orders: allOrder,
          totalPage: totalPage,
          totalCount: totalCount,
        },
      });
    } catch (e) {
      reject(e);
    }
  });
};

// ** Me - Lấy order của thằng user đang đăng nhập
const getAllOrderOfMe = (userId, params) => {
  return new Promise(async (resolve, reject) => {
    try {
      const limit = params?.limit ?? 10;
      const search = params?.search ?? '';
      const page = params?.page ?? 1;
      const order = params?.order ?? 'created desc';
      const product = params.product ?? '';
      const status = params.status ?? 1;
      // const query = buildQuery(search);
      const query = {};
      // thì phải query như thế này thì mới đúng
      query.user = mongoose.Types.ObjectId(userId);

      if (search) {
        const searchRegex = { $regex: search, $options: 'i' };

        query.$or = [{ 'orderItems.name': searchRegex }];
      }

      const { startIndex, sortOptions } = preparePaginationAndSorting(page, limit, order);

      if (product) {
        if (Array.isArray(product)) {
          query.product = { $in: product };
        } else {
          query.product = product;
        }
      }

      if (status) {
        if (Array.isArray(status)) {
          query.status = { $in: status };
        } else {
          query.status = status;
        }
      }

      const totalCount = await Order.countDocuments(query);

      const totalPage = Math.ceil(totalCount / limit);

      const fieldsToSelect = {
        status: 1,
        // email: 1,
        orderItems: 1,
        // shippingAddress: 1,
        // paymentMethod: 1,
        // deliveryMethod: 1,
        // itemsPrice: 1,
        // shippingPrice: 1,
        totalPrice: 1,
        isPaid: 1,
        paidAt: 1,
        deliveryAt: 1,
        isDelivered: 1,
        // createdAt: 1,
        // user: 1,
      };
      console.log('query', { query });
      const allOrder = await Order.find(query)
        .skip(startIndex)
        .limit(limit)
        .sort(sortOptions)
        .populate([
          {
            path: 'user',
            select: '_id firstName middleName lastName',
          },
          {
            path: 'deliveryMethod',
            select: 'name price',
          },
          {
            path: 'paymentMethod',
            select: 'name type',
          },
          {
            path: 'orderItems.product',
            select: 'countInStock slug',
            model: 'Product',
          },
        ])
        .select(fieldsToSelect);

      resolve({
        status: CONFIG_MESSAGE_ERRORS.GET_SUCCESS.status,
        message: 'Success',
        typeError: '',
        statusMessage: 'Success',
        data: {
          orders: allOrder,
          totalPage: totalPage,
          totalCount: totalCount,
        },
      });
    } catch (e) {
      reject(e);
    }
  });
};

const getDetailsOrderOfMe = (userId, orderId) => {
  return new Promise(async (resolve, reject) => {
    try {
      try {
        const checkOrder = await Order.findById({
          _id: orderId,
        }).populate([
          {
            path: 'shippingAddress.city',
            select: '_id name',
          },
          {
            path: 'orderItems.product',
            select: 'countInStock slug',
            model: 'Product',
          },
        ]);
        if (checkOrder === null) {
          resolve({
            status: CONFIG_MESSAGE_ERRORS.INVALID.status,
            message: 'The product is not existed',
            typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
            data: null,
            statusMessage: 'Error',
          });
          return;
        }
        // Phải chuyển sang dạng string vì user đang là objectId
        // thz đăng nhập có bằng với trường user ở trong orderItem này hay không, nên phải convert về string
        if (checkOrder?.user?.toString() !== userId) {
          resolve({
            status: CONFIG_MESSAGE_ERRORS.UNAUTHORIZED.status,
            message: 'You no has permission',
            typeError: CONFIG_MESSAGE_ERRORS.UNAUTHORIZED.type,
            data: null,
            statusMessage: 'Error',
          });
          return;
        }
        resolve({
          status: CONFIG_MESSAGE_ERRORS.GET_SUCCESS.status,
          message: 'Success',
          typeError: '',
          data: checkOrder,
          statusMessage: 'Success',
        });
      } catch (e) {
        reject(e);
      }
    } catch (e) {
      reject(e);
    }
  });
};

const cancelOrderOfMe = (userId, orderId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const checkOrder = await Order.findById(orderId);
      if (!checkOrder) {
        resolve({
          status: CONFIG_MESSAGE_ERRORS.INVALID.status,
          message: 'The Order is not existed',
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          data: null,
          statusMessage: 'Error',
        });
        return;
      }

      if (checkOrder.user?.toString() !== userId) {
        resolve({
          status: CONFIG_MESSAGE_ERRORS.UNAUTHORIZED.status,
          message: 'You no has permission',
          typeError: CONFIG_MESSAGE_ERRORS.UNAUTHORIZED.type,
          data: null,
          statusMessage: 'Error',
        });
        return;
      }

      if (checkOrder.isPaid === 1) {
        resolve({
          status: CONFIG_MESSAGE_ERRORS.INVALID.status,
          message: 'Cannot cancel order that has been paid',
          typeError: CONFIG_MESSAGE_ERRORS.INVALID.type,
          data: null,
          statusMessage: 'Error',
        });
        return;
      }

      checkOrder.status = 3;
      await checkOrder.save();
      resolve({
        status: CONFIG_MESSAGE_ERRORS.ACTION_SUCCESS.status,
        message: 'Order cancelled successfully',
        typeError: '',
        data: checkOrder,
        statusMessage: 'Success',
      });
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  createOrder,
  getOrderDetails,
  deleteOrderProduct,
  getAllOrder,
  getAllOrderOfMe,
  updateOrder,
  cancelOrder,
  getDetailsOrderOfMe,
  cancelOrderOfMe,
};
