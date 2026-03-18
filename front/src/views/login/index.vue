<!--
  登录页面
  提供用户登录/注册功能
 -->
<template>
  <div class="h-screen flex-center bg-nf-base">
    <el-card class="w-full max-w-100 bg-nf-card border border-nf-border rounded-3">
      <template #header>
        <h2 class="text-center m-0 text-6.5 font-700 tracking-wide nf-gradient-text">NexusFlow</h2>
      </template>
      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        @submit.prevent="handleSubmit"
      >
        <el-form-item prop="phoneNumber">
          <el-input
            v-model="formData.phoneNumber"
            placeholder="Enter phone number"
            prefix-icon="User"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            placeholder="Enter password"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            class="w-full bg-gradient-to-br from-nf-accent to-nf-accent2 border-none font-600"
          >
            {{ loading ? "Logging in..." : "Register / Login" }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { withLoading } from "@/utils/decorator.util";
import type { FormInstance } from "element-plus";

const router = useRouter();
const authStore = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);

const formData = reactive({
  phoneNumber: "",
  password: "",
});

const rules = {
  phoneNumber: [
    { required: true, message: "Please enter phone number", trigger: "blur" },
    {
      pattern: /^1[3-9]\d{9}$/,
      message: "Please enter a valid phone number",
      trigger: "blur",
    },
  ],
  password: [
    { required: true, message: "Please enter password", trigger: "blur" },
    { min: 6, message: "Password must be at least 6 characters", trigger: "blur" },
  ],
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (valid) {
      await withLoading(
        async () => {
          const response = await authStore.signIn(
            formData.phoneNumber,
            formData.password
          );
          router.push("/");
          return response;
        },
        loading,
        "Login successful"
      );
    }
  });
};
</script>

<style scoped>
:deep(.el-card__header) {
  border-bottom: 1px solid #21262d;
}

:deep(.el-form-item__error) {
  color: #f85149;
}
</style>
