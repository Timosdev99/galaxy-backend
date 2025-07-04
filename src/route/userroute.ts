import { SignUp, login,logout, allUser,  getUser, validateToken, requestAdminOtp } from "../controllers/usercontroller";
import { Router } from "express";
import { authToken } from "../middlewares/auth";
import { ManagerandAdmin , Admin} from "../middlewares/rbac";
const router = Router()


router.post("/request-admin-otp", requestAdminOtp);
router.post("/SignUp", SignUp)
router.post("/login", login)
router.post("/logout", logout)
router.get("/getuser/:id", authToken, getUser)
router.get("/alluser", authToken,Admin, allUser)
router.get("/validate-token", authToken, validateToken)
export default router  