import React from 'react'
import { motion } from 'framer-motion'
import { Facebook, Instagram, Twitter, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import motolinkLogo from '../../public/favicon.svg'

/**
 * Footer Component
 * 
 * Site footer with social links, company info, and navigation
 * Features:
 * - Social media links
 * - Quick navigation links
 * - Contact information
 * - Copyright and legal links
 * - Responsive layout
 */

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear()

  const socialLinks = [
    {
      name: 'Facebook',
      icon: Facebook,
      url: 'https://facebook.com',
      label: 'Visit MotoLink on Facebook',
    },
    {
      name: 'Instagram',
      icon: Instagram,
      url: 'https://instagram.com',
      label: 'Follow MotoLink on Instagram',
    },
    {
      name: 'Twitter',
      icon: Twitter,
      url: 'https://twitter.com',
      label: 'Follow MotoLink on Twitter',
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      url: 'https://linkedin.com',
      label: 'Connect on LinkedIn',
    },
  ]

  const navLinks = [
    { label: 'Browse Shops', href: '#shops' },
    { label: 'Map', href: '#map' },
    
  
   
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  }

  return (
    <footer className="w-full bg-moto-darker border-t border-moto-gray text-white">
      {/* Main Footer Content */}
      <motion.div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 sm:gap-10">
          {/* Brand Section */}
          <motion.div variants={itemVariants}>
            <h3 className="text-2xl font-display font-bold text-white mb-4">
              <img src={motolinkLogo} alt="Motolink Autoshop Clientele" className="h-16 w-auto object-contain object-left" />
            </h3>
            <p className="text-slate-200 mb-6 text-sm leading-relaxed">
              Discover trusted partner shops for motorcycle and automotive care across your area.
            </p>
            <p className="text-slate-200 text-xs">
              Find. Connect. Ride confidently. © {currentYear} Motolink Autoshop Clientele
            </p>
          </motion.div>

          {/* Navigation Links */}
          <motion.div variants={itemVariants}>
            <h4 className="text-white font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-slate-300 hover:text-moto-accent transition-colors text-sm flex items-center gap-1"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Contact Info */}
          <motion.div variants={itemVariants}>
            <h4 className="text-white font-semibold mb-4">Contact</h4>
            <ul className="space-y-3 text-sm text-slate-200">
              <li className="flex items-start gap-3 hover:text-white transition-colors">
                <MapPin size={18} className="mt-0.5 flex-shrink-0" />
                <span>Metro Manila, Philippines<br />Connecting nearby independent shops</span>
              </li>
              <li className="flex items-center gap-3 hover:text-white transition-colors cursor-pointer">
                <Phone size={18} />
                <a href="tel:+639123456789">+63 912 345 6789</a>
              </li>
              <li className="flex items-center gap-3 hover:text-white transition-colors">
                <Mail size={18} />
                <a href="mailto:hello@motolink.ph">hello@motolink.ph</a>
              </li>
            </ul>
          </motion.div>

          {/* Social Links */}
          <motion.div variants={itemVariants}>
            <h4 className="text-slate-900 font-semibold mb-4">Follow Us</h4>
            <div className="flex gap-4 mb-6">
              {socialLinks.map((social) => {
                const Icon = social.icon
                return (
                  <motion.a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-slate-200 hover:bg-slate-900 text-slate-600 hover:text-white flex items-center justify-center transition-colors"
                    whileHover={{ scale: 1.1, rotate: 10 }}
                    whileTap={{ scale: 0.95 }}
                    aria-label={social.label}
                  >
                    <Icon size={18} />
                  </motion.a>
                )
              })}
            </div>

            {/* Newsletter CTA in Footer */}
          </motion.div>
        </div>
      </motion.div>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Bottom Footer */}
      <motion.div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-slate-200 text-sm"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        viewport={{ once: true }}
      >
        <p>
          All rights reserved. |{' '}
          <a href="#" className="text-white hover:text-moto-accent">
            Privacy
          </a>{' '}
          |{' '}
          <a href="#" className="text-white hover:text-moto-accent">
            Terms
          </a>
        </p>
      </motion.div>
    </footer>
  )
}

export default Footer
